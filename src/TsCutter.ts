import { TSParser } from './tsParser/TsParser'

const CLOCK = 90000

export class TsCutter {
    uint8Array: Uint8Array
    tsParser: TSParser
    constructor(uint8Array: Uint8Array) {
        this.uint8Array = uint8Array
        this.tsParser = new TSParser()
        this.tsParser.push(uint8Array)
    }

    cutTs(ms: number) {
        let packets = this.tsParser.packets
        let idx = this.findStartTimePacketIdx(ms, packets)
        if (idx === -1) {
            return this.uint8Array
        }
        let offset = this.tsParser.packets[idx].offset

        let prolog_end_idx = this.findPrologEndIdx(packets)
        let prologEndOffset = this.tsParser.packets[prolog_end_idx].offset
        // console.log('prolog_end', prologEndOffset)
        console.log(`cut away (${prologEndOffset}, ${offset})`)

        let buf = this.uint8Array
        let prolog = buf.subarray(0, prologEndOffset)
        let tail = buf.subarray(offset)
        console.log('len(prolog, tail)', prolog.length, tail.length)

        var output = new Uint8Array(prologEndOffset + (buf.length - offset));
        output.set(prolog);
        output.set(tail, prolog.length);
        return output
    }

    findStartTimePacketIdx(ms: number, packets: any[]) {
        let secs: number = ms / 1000
        let idx: number = -1
        for (let i = 0; i < packets.length; i++) {
            let p = packets[i]
            let pts: number = p.pts
            if (!p.pts) continue
            // console.log(i, p.pts, p.offset)
            if (pts > secs * CLOCK) {
                return idx
            }
            idx = i
        }
        return idx
    }

    findPrologEndIdx(packets: any[]) {
        let idx = -1
        for (let i = 0; i < packets.length; i++) {
            let p = packets[i]
            if (p._type === 'PAT' || p._type === 'PMT' || p._type === 'METADATA') {
                if (i - idx > 1) {
                    throw new Error('Unsupported: Uncontinous prolog data')
                }
                idx = i
            }
        }
        return idx + 1
    }
}

