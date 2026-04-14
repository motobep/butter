// import { MusicPlayer } from '@MusicPlayer/MusicPlayer';
// import { MusicItem, MusicPageDescr } from '@MusicPlayer/types';

// export declare const musicPlayer: MusicPlayer

declare const musicPlayer: any
type MusicPageDescr = any
type MusicItem = any

type Query = { fnName: string, args: any[] };

export async function getLang(arr: { type_: string }[]) {
    let langType = await musicPlayer.getLanguageAsync()
    let lang = arr.find(el => el.type_ === langType)
    return lang
}

export function setHttpProxy(proxy: string) {
    musicPlayer.runtime.setProxy({ http_proxy: proxy, https_proxy: proxy })
}

export async function withPushAsync(query: Query, client: any) {
    await withQuery(query, client, musicPlayer.source.currPageStack.pushAsync)
}

export async function withSetLastAsync(query: Query, client: any) {
    await withQuery(query, client, musicPlayer.source.currPageStack.last_setAsync)
}

/**
 * Approach using query helps to implement reloadAsync()
 * by just running query from current page.props
 */
export async function withQuery(query: Query, client: any, fn: (page: MusicPageDescr) => Promise<any>) {
    let page = await runQuery(query, client)
    if (!page) {
        throw new Error('Nullish page')
    }
    page.props = { ...page.props, query }
    await fn(page)
    await musicPlayer.updateAppStateAsync()
}

async function runQuery(query: Query, client: any): Promise<MusicPageDescr> {
    let { fnName, args } = query
    if (!(fnName in client)) {
        throw new Error(`Undefiend fnName: ${fnName}`)
    }
    let page: MusicPageDescr = await client[fnName](...args)
    return page
}

export async function loadHighResCoverAsync(mi: MusicItem, highResCoverUrlFn: (s: string) => string) {
    if (!mi.thumbnailUrl) return `nullish thumbnailUrl for ${mi}`
    let url = highResCoverUrlFn(mi.thumbnailUrl)
    if (url == mi.thumbnailUrl) return `Already high resolution or bad url`
    await musicPlayer.source.updateThumbnailFromUrlAsync(mi.id, url)
    await musicPlayer.updateAppStateAsync()
}

export function objectToQueryString(obj) {
    var str = [];
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
    }
    return str.join("&");
}
