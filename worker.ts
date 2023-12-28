import localforage from "./localforage.js"
export {}
// THIS IS A SERVICE WORKER SCRIPT :D
/// <reference path='../../../node_modules/typescript/lib/lib.es6.d.ts' />
/// <reference path='../../../node_modules/typescript/lib/lib.webworker.d.ts' />
// It gets installed and runs over any page that registers it
// globals are actually WorkerGlobalScope / WindowOrWorkerGlobalScope
// Remember, the only way out of here is postMessage(), and the only way in is onmessage()
// (well, there's also FetchEvent but who would use that for communication?)

const VERSION_W: VersionSpec = {
    major: 0,
    patch: 4
}

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

let redirects = {
    doPerform: false,
    newBaseURI: "",
}

declare var self: ServiceWorkerGlobalScope;

self.addEventListener("message", async (event) => {
    const packet = event.data as MessagePacket
    const client = event.source as Client
    if (packet.action === "version") {
        client.postMessage({
            action: "version",
            data: VERSION_W,
        })
    } else if (packet.action === "reset") {
        redirects.doPerform = false
        client.postMessage({
            action: "reset",
            data: null,
        })
    }
})

self.addEventListener("install", (event) => {
    console.info("Install service worker...")
    event.waitUntil((async () => {
        self.skipWaiting() // shut up and activate already
    })())
})
self.addEventListener("activate", (event) => {
    // hello! cast magic missle or something now
    console.info("WE ACTIVATED WHOOOOOOOO")
})
