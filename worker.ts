import localforage from "localforage";
export { }
// THIS IS A SERVICE WORKER SCRIPT :D
// It gets installed and runs over any page that registers it
// globals are actually WorkerGlobalScope / WindowOrWorkerGlobalScope
// Remember, the only way out of here is postMessage(), and the only way in is onmessage()
// (well, there's also FetchEvent but who would use that for communication?)

declare var self: ServiceWorkerGlobalScope;

const VERSION_W: VersionSpec = {
    major: 0,
    patch: 4
}
const HOST = 'https://penguinencounter.github.io'
// const HOST = 'http://localhost:8000'


localforage.config(
    {
        driver: localforage.INDEXEDDB,
        name: "ttjs",
        version: VERSION_W.major * 1000 + VERSION_W.patch,
        storeName: "ttjs_workers",
        description: "TTJS Service Workers"
    }
)

type MessagePacket = {
    action: string,
    data: any,
}

type AM = {
    description: string,
    dir: string,
    rewrite: {[pattern: string]: string},
    direct: string[]
}

type AllManif = {
    [name: string]: AM
}

type StateResponse = {
    active: boolean,
    activeSwitch?: string
}

interface BasicState {
    version: number,
    redirectActive: boolean,
    base: string,
    assetManifest: AM | null,
    manifests: AllManif | null,
}

const defaultState: BasicState = {
    version: 4,
    redirectActive: false,
    base: `${HOST}/pure-ts-compilation/static/`,
    assetManifest: null,
    manifests: null
}
let state: BasicState = defaultState

let logstack: MessagePacket[] = []


async function save(alertTo: Client | null = null) {
    await localforage.setItem("state", state)
    if (alertTo) {
        rlog("Service Worker: state saved: " + JSON.stringify(state))
    }
}


self.addEventListener("message", async (event) => {
    const packet = event.data as MessagePacket
    const client = event.source as Client
    try {
        console.log("Service Worker: message received: " + JSON.stringify(packet))
    } catch (e) {
        console.log("Service Worker: message received: " + packet)
    }
    for (let i = 0; i < logstack.length; i++) {
        client.postMessage(logstack[i])
    }
    logstack = []
    if (packet.action === "version") {
        client.postMessage({
            action: "version",
            data: VERSION_W,
        })
    } else if (packet.action === "reset") {
        console.warn("Resetting state to defaults...")
        state = defaultState
        await save()
        client.postMessage({
            action: "reset",
            data: null,
        })
    } else if (packet.action === "query") {
        client.postMessage({
            action: "query",
            data: {
                active: state.redirectActive,
                activeSwitch: state.assetManifest ? state.assetManifest.dir : null
            }
        } as { action: "query", data: StateResponse })
    } else if (packet.action === "getVersions") {
        console.info("Fetching versions")
        const resp = await fetch(state.base + "instmanif.json", {cache: "no-cache"})
        const json: AllManif = await resp.json()
        state.manifests = json
        await save()
        client.postMessage({
            action: "getVersions",
            data: json,
        })
    } else if (packet.action === "switchOn") {
        if (!state.manifests) {
            rlog("Service Worker: error switchOn: no manifests")
            client.postMessage({
                action: "switchOn",
                data: {
                    ok: false,
                    error: "no manifests",
                },
            })
            return
        }
        const manifest = state.manifests[packet.data]
        if (!manifest) {
            rlog("Service Worker: error switchOn: no such version")
            client.postMessage({
                action: "switchOn",
                data: {
                    ok: false,
                    error: "no manifest",
                },
            })
            return
        }
        state.redirectActive = true
        state.assetManifest = manifest
        // mark the cache for deletion
        indexedDB.deleteDatabase("UnityCache")
        await save()
        client.postMessage({
            action: "switchOn",
            data: {
                ok: true,
                error: null,
            },
        })
    } else if (packet.action === "switchOff") {
        state.redirectActive = false
        state.assetManifest = null
        // mark the cache for deletion
        indexedDB.deleteDatabase("UnityCache")
        await save()
        client.postMessage({
            action: "switchOff",
            data: {
                ok: true,
                error: null,
            },
        })
    }
})

function rlog(message: string) {
    logstack.push({
        action: "log",
        data: message,
    })
    console.log("Service Worker: " + message)
}

self.addEventListener("install", (event) => {
    console.info("Install service worker...")
    event.waitUntil((async () => {
        try {
            console.info("Localforage waiting...")
            await localforage.ready();
            console.info("Localforage recall state...")
            let incomingState = (await localforage.getItem("state")) as Partial<BasicState>;
            if (incomingState == null
                || typeof incomingState != "object"
                || !incomingState.version
                || incomingState.version < state.version
            ) {
                console.info("Localforage state too old, resetting...")
                incomingState = state
            }
            state = <BasicState>incomingState
            console.info("Localforage write state...")
            await save();
            await self.skipWaiting() // shut up and activate already
        } catch (e) {
            console.error("Service Worker: error during install: " + e)
        }
    })())
})
self.addEventListener("activate", (event) => {
    // hello! cast magic missle or something now
    console.info("WE ACTIVATED WHOOOOOOOO")
    event.waitUntil((async () => {
        console.info("Claim clients...")
        await self.clients.claim();
        rlog("Service Worker: state loaded: " + JSON.stringify(state))
        try {
            self.clients.matchAll().then(
                clients => clients.forEach(client => {
                    console.info("TELLING " + client + " WE'RE READY")
                    client.postMessage({
                        action: "READY",
                        data: null,
                    })
                })
            ).catch(e => console.error("Service Worker: error during activate Promise: " + e))
        } catch (e) {
            console.error("Service Worker: error during activate: " + e)
        }
    })());
})

async function fixGzip(path: string, resp: Response): Promise<Response> {
    if (!resp.body) return resp
    console.info("Service Worker: Inlining gzip for " + path)
    const ungzpath = path.replace(/\.gz$/, "")
    let fakeMimeType = null

    if (ungzpath.endsWith(".js")) fakeMimeType = "text/javascript"
    if (ungzpath.endsWith(".css")) fakeMimeType = "text/css"
    if (ungzpath.endsWith(".html")) fakeMimeType = "text/html"
    if (ungzpath.endsWith(".json")) fakeMimeType = "application/json"
    if (ungzpath.endsWith(".wasm")) fakeMimeType = "application/wasm"
    if (ungzpath.endsWith(".svg")) fakeMimeType = "image/svg+xml"

    const decompressor = new DecompressionStream("gzip")
    const decompressedStream = resp.body.pipeThrough(decompressor)
    const headers = new Headers(resp.headers)
    headers.delete("Content-Encoding")
    headers.delete("Content-Length")
    if (fakeMimeType) headers.set("Content-Type", fakeMimeType)
    return new Response(decompressedStream, {
        status: resp.status,
        statusText: resp.statusText,
        headers: headers
    })
}

async function fetchHandler(request: Request): Promise<Response> {
    if (!state.redirectActive) return fetch(request)
    if (!state.assetManifest) {
        rlog("Service Worker: error fetch: no asset manifest")
        return fetch(request)
    }
    const url = new URL(request.url)
    let path = url.pathname
    for (let [pattern, replacement] of Object.entries(state.assetManifest.rewrite)) {
        const reg = new RegExp(pattern, 'g')
        path = path.replace(reg, replacement)
    }
    if (url.pathname != path) {
        console.info(`Path rewriting: ${url.pathname} to ${path}`)
    }
    for (let rule of state.assetManifest.direct) {
        let reg = new RegExp(rule)
        let evalur = reg.exec(path)
        if (evalur) {
            const newUrl = new URL(state.base + state.assetManifest.dir + evalur[1])
            rlog("Service Worker: redirecting " + path + " to " + newUrl)
            const resp = await fetch(newUrl.toString())
            console.debug(`detected inbound headers ${newUrl.toString()}: ${JSON.stringify([...resp.headers.entries()])}`)
            // Is the encoding Messed Up?
            if (resp.headers.get("Content-Type") === "application/gzip" && (!resp.headers.has("Content-Encoding") || resp.headers.get("Content-Encoding") !== "gzip")) {
                return fixGzip(path, resp)
            }
            return resp
        }
    }
    rlog("Service Worker: info fetch: no match for " + path)
    return fetch(request)
}

self.addEventListener("fetch", (event) => {
    event.respondWith(fetchHandler(event.request))
})
