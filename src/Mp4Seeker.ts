import * as MP4Box from 'mp4box'
import { assert } from './assert.ts'

export type bytes = number[]

export class Mp4Seeker {
    mp4boxfile: MP4Box.ISOFile
    isReady: boolean = false
    my_buffer: MP4Box.MP4BoxBuffer
    constructor(arrayBuffer: ArrayBuffer, keepMdatData: boolean = false) {
        let buffer = MP4Box.MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0)
        this.my_buffer = buffer
        this.mp4boxfile = MP4Box.createFile(keepMdatData);
        this.mp4boxfile.onError = (e) => {
            console.log('onError', e)
        }
        this.mp4boxfile.onMoovStart = () => {
            console.log('onMoovStart');
        };
        this.mp4boxfile.onReady = (info) => {
            console.log('isReady');
            this.isReady = true
        }
        this.mp4boxfile.appendBuffer(buffer);
        let info = this.mp4boxfile.getInfo()
        console.log('info', info)
        let mdat = this.mp4boxfile.getBox('mdat')
        console.log(this.mp4boxfile)
        // console.log('mdat', mdat)
    }

    /** Throws */
    getRange(startTimeMs: number, endTimeMs: number) {
        let s = this.seek(startTimeMs)
        let e = this.seek(endTimeMs)
        return [s, e]
    }

    /** Throws */
    subarrayByTime(ms: number): bytes {
        let { offset } = this.seekTrun(ms)
        // let buffer: MP4Box.MP4BoxBuffer = this.mp4boxfile.getBuffer().buffer
        let buffer: MP4Box.MP4BoxBuffer = this.my_buffer
        console.log('mp4seeker: buffer len', buffer.byteLength)
        let uint8Array: Uint8Array = new Uint8Array(buffer)
        var arr = Array.from(uint8Array.subarray(offset, uint8Array.length))
        console.log('mp4seeker: arr len', arr.length)
        // var arr = Array.from(uint8Array)
        return arr
    }

    /** Throws */
    seekTrun(ms: number) {
        let sidx = this.mp4boxfile.getBox('sidx')
        let moof = this.mp4boxfile.getBox('moof')
        let trun = this.mp4boxfile.getBox('trun')
        let tfhd = this.mp4boxfile.getBox('tfhd')
        if (!trun) {
            throw new Error('Error: no audio trun box')
        }
        let secs = ms / 1000

        let timescale: number = sidx.timescale
        let samples = trun.sample_size

        if (samples.length === 0) {
            return { offset: 0, time: 0 };
        }
        if (!trun.sample_duration) {
            throw new Error('trun.sample_duration not supported')
        }

        // default_sample_size 	427
        let time_scaled = secs * timescale

        let sample_duration = tfhd.default_sample_duration // usually = 1024
        let seek_offset = moof.start + trun.data_offset
        let t = sidx.earliest_presentation_time
        for (let j = 0; j < samples.length; j++) {
            let sample_size = samples[j]

            seek_offset += sample_size
            t += sample_duration
            // console.log(t / timescale, seek_offset)

            if (t > time_scaled) {
                seek_offset -= sample_size
                t -= sample_duration
                break
            }
        }
        console.log(seek_offset)
        return { offset: seek_offset, timeMs: t / timescale * 1000 };
    }

    moofSeekPoint(ms: number, sidx: any, trun: any, tfhd: any) {
        if (!trun) {
            throw new Error('Error: no audio trun box')
        }
        let secs = ms / 1000

        let timescale: number = sidx.timescale
        let samples = trun.sample_size

        if (samples.length === 0) {
            return { sample_idx: 0, offset: 0, time_ticks: 0 };
        }
        if (!trun.sample_duration) {
            throw new Error('trun.sample_duration not supported')
        }

        let time_scaled = secs * timescale

        let sample_duration = tfhd.default_sample_duration // usually = 1024
        let j = 0
        let seek_offset = 0
        let t = 0
        let _next_t = 0
        for (; j < samples.length; j++) {
            _next_t += sample_duration
            if (_next_t > time_scaled) { break }
            let sample_size = samples[j]
            seek_offset += sample_size
            t = _next_t
            console.log(j, t, seek_offset)
            console.log(j, t / timescale, seek_offset)
        }
        console.log(seek_offset)
        return { sample_idx: j, offset: seek_offset, time_ticks: t };
    }

    cutM4s(ms: number) {
        /*
            sidx: earliest_presentation_time
                0: referenced_size, subsegment_duration
            moof: size
                traf: size
                    tfdt: baseMediaDecodeTime
                    trun: size, sample_size, sample_count, data_offset
            mdat: size, (start)
            }
            sample_size.slice(offset)
            mdat.slice(offset)
         */

        const SAMPLE_WIDTH = 4

        let sidx = this.mp4boxfile.getBox('sidx')
        let sidx_0 = sidx.references[0]
        let moof = this.mp4boxfile.getBox('moof')
        let traf = this.mp4boxfile.getBox('traf')
        let tfdt = this.mp4boxfile.getBox('tfdt')
        let trun = this.mp4boxfile.getBox('trun')
        let mdat = this.mp4boxfile.getBox('mdat')

        let tfhd = this.mp4boxfile.getBox('tfhd')

        let p = this.moofSeekPoint(ms, sidx, trun, tfhd)
        let time_skipped: number = p.time_ticks
        let removed_samples_count: number = p.sample_idx
        let mdat_removed_size: number = p.offset

        let samples_removed_size: number = removed_samples_count * SAMPLE_WIDTH

        let earliest_presentation_time: number = sidx.earliest_presentation_time + time_skipped
        let referenced_size: number = sidx_0.referenced_size - samples_removed_size - mdat_removed_size // = sizeOf(moof + mdat)
        let subsegment_duration: number = sidx_0.subsegment_duration - time_skipped
        sidx.earliest_presentation_time = earliest_presentation_time
        sidx_0.referenced_size = referenced_size
        sidx_0.subsegment_duration = subsegment_duration

        moof.size -= samples_removed_size
        traf.size -= samples_removed_size
        tfdt.baseMediaDecodeTime = earliest_presentation_time

        trun.size -= samples_removed_size
        trun.sample_size = trun.sample_size.slice(removed_samples_count) // slice
        assert(trun.sample_count === trun.sample_size.length + removed_samples_count, 'Must be equal')
        trun.sample_count = trun.sample_size.length
        trun.data_offset -= samples_removed_size

        // mdat.parseDataAndRewind()
        mdat.size -= mdat_removed_size
        console.log('data', mdat.data)
        console.log('stream len', mdat.stream.buffer.byteLength)
        let new_buf = mdat.stream.buffer.slice(mdat_removed_size) // slice
        console.log('new_buf', new_buf.byteLength)
        mdat.stream = new MP4Box.MultiBufferStream(MP4Box.MP4BoxBuffer.fromArrayBuffer(new_buf, 0))

        console.log('data after', mdat.stream.buffer.byteLength)
        console.log(mdat.size + moof.size, referenced_size)
        assert(mdat.size + moof.size === referenced_size, 'Must be equal')

        // this.mp4boxfile.save('f')
        let dataStream = new MP4Box.DataStream()

        this.mp4boxfile.write(dataStream)
        return dataStream
    }

    /** Throws */
    seek(ms: number) {
        if (!this.isReady) {
            throw new Error('Error: moov not fully read')
        }
        let trak = this._getAudioTrak()
        if (!trak) {
            throw new Error('Error: no audio trak')
        }
        let secs = ms / 1000
        let seekInfo = this.mp4boxfile.seekTrack(secs, true, trak)
        let seekPoint = { offset: seekInfo.offset, timeMs: seekInfo.time * 1000 }
        // console.log('seekPoint', seekPoint)
        return seekPoint
    }

    getDuration() {
        let traks = this.mp4boxfile.moov.traks
        for (let trak of traks) {
            if (trak.mdia.minf.smhd) {
                return this.mp4boxfile.getTrackDuration(trak) * 1000
            }
        }
        return -1
    }

    seekTime(offset: number) {
        let trak = this._getAudioTrak()
        if (!trak) {
            console.log('Bad trak:', trak)
            return null
        }
        let seek_offset = -1
        let time = -1
        let timescale = -1
        for (let s of trak.samples) {
            // const sample_offset = s.offset + s.alreadyRead
            const sample_offset = s.offset + s.size
            if (offset <= sample_offset) {
                seek_offset = sample_offset
                time = s.cts;
                timescale = s.timescale;
                break
            }
        }
        if (seek_offset === -1) {
            let s = trak.samples[trak.samples.length - 1]
            // const sample_offset = s.offset + s.alreadyRead
            const sample_offset = s.offset + s.size
            seek_offset = sample_offset
            time = s.cts;
            timescale = s.timescale;
        }
        return { offset: seek_offset, timeMs: time / timescale * 1000 };
    }

    _getAudioTrak() {
        let traks = this.mp4boxfile.moov.traks
        for (let trak of traks) {
            if (trak.mdia.minf.smhd) return trak
        }
        return null
    }
}

