let TTJSIntegration = {
    //  ^?
    okay: true
}

interface Window {
    TTJSIntegration: typeof TTJSIntegration;
}
window.TTJSIntegration = TTJSIntegration;

type VersionSpec = {
    major: number,
    patch: number,
}
const VERSION_I: VersionSpec = {
    major: 0,
    patch: 4,
}

type MessagePacket = {
    action: string,
    data: any,
}

const NetQueue: MessagePacket[] = []
const wants: { [key: string]: ((target: MessagePacket) => boolean)[] } = {}

async function queueCycler() {
    while (true) {
        while (NetQueue.length > 0) {
            const packet = NetQueue.shift() as MessagePacket
            if (wants[packet.action]) {
                console.log("Processing SW packet: " + JSON.stringify(packet))
                for (let i = 0; i < wants[packet.action].length; i++) {
                    const want = wants[packet.action][i]
                    console.log("   Firing callback no. " + i)
                    if (want(packet)) {
                        wants[packet.action].splice(i, 1)
                        break
                    }
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}

async function query(deliverTo: ServiceWorker, action: string, data: any): Promise<MessagePacket> {
    deliverTo.postMessage({
        action: action,
        data: data,
    })
    return await new Promise(
        resolve => {
            wants[action] = wants[action] || []
            wants[action].push(response => {
                resolve(response)
                return true
            })
        }
    )
}

async function signal(name: string): Promise<void> {
    return await new Promise<void>(
        resolve => {
            wants[name] = wants[name] || []
            wants[name].push(_ => {
                console.log("Signalled: " + name)
                resolve()
                return true
            })
        }
    )
}


function displayError(message: string) {
    const error = document.createElement("div")
    error.style.backgroundColor = "#ff8888"
    error.style.paddingLeft = "10px"
    error.style.paddingRight = "10px"
    error.style.float = "left"
    error.style.width = "max-content"
    error.style.lineHeight = "38px"
    error.style.fontSize = "18px"
    error.style.color = "#000000"
    error.style.fontFamily = "arial, Helvetica, sans-serif"
    error.textContent = message
    const footer_bar = document.querySelector("#unity-footer")!
    const append_before = footer_bar.querySelector("div#unity-fullscreen-button")!
    footer_bar.insertBefore(error, append_before)
}

let revisionActive = false

type AM = {
    description: string,
    dir: string,
    rewrite: { [pattern: string]: string },
    direct: string[]
}

type AllManif = {
    [name: string]: AM
}

type StateResponse = {
    active: boolean,
    activeSwitch?: string
}

let versionInfo: AllManif | null = null

function injectDOMElements() {
    const styles = `
.-tt-selector {
    display: none;
    position: fixed;
    top: 20px;
    left: 20px;
    bottom: 20px;
    right: 20px;
    background: conic-gradient(from -90deg at 50% -25%, blue, blueviolet);
    z-index: 1000;
    border-radius: 20px;
    flex-flow: column nowrap;
    overflow: hidden auto;
    padding: 20px;
    padding-top: 48px;
    gap: 10px;
}
.-tt-selector .-tt-card {
    border-radius: 10px;
    background-color: #00000020;
    padding: 10px;
    padding-right: 48px;
    color: #ffffff;
    font-family: sans-serif;
    display: flex;
    flex-flow: column nowrap;
    gap: 0;
    position: relative;
}
.-tt-selector .-tt-card .-tt-title {
    font-family: monospace;
    font-size: 24px;
    font-weight: bold;
}
.-tt-selector .-tt-card .-tt-description {
    font-size: 18px;
}
.-tt-selector .-tt-card .-tt-activate {
    position: absolute;
    right: 5px;
    top: 5px;
    width: 38px;
    height: 38px;
    padding: 0;
    margin: 0;
    border: none;
    background: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEwLjA1NCAxMC4wNTQiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0ibTMuMzYxOSAxLjk5MDhjLTAuMjA3MS0wLjEyNzM0LTAuNDY3MzctMC4xMzE1NC0wLjY3ODY3LTAuMDEyNTk0LTAuMjExMyAwLjExODk0LTAuMzQyODMgMC4zNDI4My0wLjM0MjgzIDAuNTg2MzF2NC45MjU2YzAgMC4yNDM0OCAwLjEzMTU0IDAuNDY3MzcgMC4zNDI4MyAwLjU4NjMyIDAuMjExMyAwLjExODk0IDAuNDcxNTcgMC4xMTMzNCAwLjY3ODY3LTAuMDEyNTI0bDQuMDMtMi40NjI4YzAuMjAwMS0wLjEyMTczIDAuMzIxODQtMC4zMzg2NCAwLjMyMTg0LTAuNTczNzIgMC0wLjIzNTA5LTAuMTIxNzQtMC40NTA1OC0wLjMyMTg0LTAuNTczNzJ6IiBmaWxsPSIjZmZmIiBzdHJva2Utd2lkdGg9Ii4wMTM5OTMiLz48L3N2Zz4K");
    background-color: #ffffff20;
    border-radius: 8px;
    cursor: pointer;
}

.-tt-selector.--open {
    display: flex;
}
.-tt-selector .-tt-quit {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 38px;
    height: 38px;
    padding: 0;
    margin: 0;
    border: none;
    background: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEwLjA1NCAxMC4wNTQiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0ibTcuOTc2NiAyLjk2MjhjMC4yNDQ4MS0wLjI0NDgxIDAuMjQ0ODEtMC42NDIzOCAwLTAuODg3MTktMC4yNDQ4MS0wLjI0NDgxLTAuNjQyMzgtMC4yNDQ4MS0wLjg4NzE5IDBsLTIuMDYyMyAyLjA2NDItMi4wNjQyLTIuMDYyM2MtMC4yNDQ4MS0wLjI0NDgxLTAuNjQyMzgtMC4yNDQ4MS0wLjg4NzE5IDAtMC4yNDQ4MSAwLjI0NDgxLTAuMjQ0ODEgMC42NDIzOCAwIDAuODg3MTlsMi4wNjQyIDIuMDYyMy0yLjA2MjMgMi4wNjQyYy0wLjI0NDgxIDAuMjQ0ODEtMC4yNDQ4MSAwLjY0MjM4IDAgMC44ODcxOSAwLjI0NDgxIDAuMjQ0ODEgMC42NDIzOCAwLjI0NDgxIDAuODg3MTkgMGwyLjA2MjMtMi4wNjQyIDIuMDY0MiAyLjA2MjNjMC4yNDQ4MSAwLjI0NDgxIDAuNjQyMzggMC4yNDQ4MSAwLjg4NzE5IDAgMC4yNDQ4MS0wLjI0NDgxIDAuMjQ0ODEtMC42NDIzOCAwLTAuODg3MTlsLTIuMDY0Mi0yLjA2MjN6IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9Ii43NSIgc3Ryb2tlLXdpZHRoPSIuMDE5NTg1Ii8+PC9zdmc+Cg==");
    cursor: pointer;
}
`
    if (document.querySelector("style#-tt-styles") == null) {
        const style = document.createElement("style")
        style.id = "-tt-styles"
        style.textContent = styles
        document.head.appendChild(style)
    }
    const footer_bar = document.querySelector("#unity-footer")!
    const append_before = footer_bar.querySelector("div#unity-fullscreen-button")!


    const versionPicker = document.createElement("div")
    versionPicker.classList.add("-tt-selector")
    const quitVersionPickerButton = document.createElement("button")
    quitVersionPickerButton.classList.add("-tt-quit")
    quitVersionPickerButton.addEventListener("click", () => {
        versionPicker.classList.remove("--open")
    })
    versionPicker.appendChild(quitVersionPickerButton)
    document.body.appendChild(versionPicker)

    if (versionInfo === null) {
        versionPicker.textContent = "(no versions available)"
    } else {
        const TEMPLATE = `
    <div class="-tt-title"></div>
    <div class="-tt-description"></div>
    <button class="-tt-activate"></button>
        `
        for (const [name, manif] of Object.entries(versionInfo)) {
            const card = document.createElement("div")
            card.classList.add("-tt-card")
            card.innerHTML = TEMPLATE
            const title = card.querySelector(".-tt-title")!
            const description = card.querySelector(".-tt-description")!
            const activate = card.querySelector(".-tt-activate")!
            title.textContent = name
            description.innerHTML = manif.description
            activate.addEventListener("click", () => {
                window.swSwitch(name)
                title.textContent += " (switching...)"
                activate.remove()
            })
            versionPicker.appendChild(card)
        }
    }

    function buttony(e: HTMLElement) {
        e.style.width = "38px"
        e.style.height = "38px"
        e.style.border = "none"
        e.style.cursor = "pointer"
        e.style.marginLeft = "10px"
        e.style.marginRight = "10px"
        e.style.float = "left"
    }
    const activationButton = document.createElement("button")
    activationButton.style.background = "url(\"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEwLjA1NCAxMC4wNTQiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGc+PHJlY3Qgd2lkdGg9IjEwLjA1NCIgaGVpZ2h0PSIxMC4wNTQiIGZpbGw9IiM2MTExOWUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEuMSIgc3Ryb2tlLXdpZHRoPSIxLjA1OCIvPjxwYXRoIGQ9Im0yLjM1NCAyLjM1NDEtMC41MDIxMi0wLjUwMjEyYy0wLjIyMy0wLjIyMy0wLjYwNTUtMC4wNjUwMTYtMC42MDU1IDAuMjQ5NTh2MS42MjZjMCAwLjE5NjQgMC4xNTgwNyAwLjM1NDQzIDAuMzU0NDQgMC4zNTQ0M2gxLjYyNmMwLjMxNjA0IDAgMC40NzQwNi0wLjM4MjQ5IDAuMjUxMDYtMC42MDU0OWwtMC40NTQ4Ni0wLjQ1NDg4YzAuNTEyNDYtMC41MTI0NSAxLjIyMTQtMC44Mjk5NyAyLjAwNDEtMC44Mjk5NyAxLjU2NTQgMCAyLjgzNTUgMS4yNzAxIDIuODM1NSAyLjgzNTVzLTEuMjcwMSAyLjgzNTUtMi44MzU1IDIuODM1NWMtMC42MDI1NCAwLTEuMTYwOC0wLjE4NzU2LTEuNjIwMS0wLjUwODAzLTAuMjE0MTQtMC4xNDkxNC0wLjUwODAzLTAuMDk3NTI0LTAuNjU4NjggMC4xMTY2NC0wLjE1MDU3IDAuMjE0MTQtMC4wOTc1MjQgMC41MDgwMyAwLjExNjY0IDAuNjU4NjYgMC42MTQzNiAwLjQyNjgyIDEuMzYwMiAwLjY3Nzg4IDIuMTYyMSAwLjY3Nzg4IDIuMDg4MiAwIDMuNzgwNy0xLjY5MjQgMy43ODA3LTMuNzgwN3MtMS42OTI0LTMuNzgwNy0zLjc4MDctMy43ODA3Yy0xLjA0NDEgMC0xLjk4OTMgMC40MjM4NS0yLjY3MzEgMS4xMDc2em0yLjY3MzEgMC43ODI3M2MtMC4xOTY0MiAwLTAuMzU0NDQgMC4xNTgwNy0wLjM1NDQ0IDAuMzU0NDN2MS41MzU5YzAgMC4wOTQ0ODcgMC4wMzY5NzMgMC4xODQ2IDAuMTAzNDIgMC4yNTEwNmwxLjA2MzMgMS4wNjMzYzAuMTM4NzggMC4xMzg3OCAwLjM2MzMgMC4xMzg3OCAwLjUwMDY2IDAgMC4xMzczNS0wLjEzODc4IDAuMTM4NzgtMC4zNjMzIDAtMC41MDA2NGwtMC45NTk5NS0wLjk1OTk1di0xLjM4OTdjMC0wLjE5NjQtMC4xNTgwNy0wLjM1NDQzLTAuMzU0NDQtMC4zNTQ0M3oiIGZpbGw9IiNmZmYiIHN0cm9rZS13aWR0aD0iLjAxNDc2OCIvPjwvZz48L3N2Zz4K\") no-repeat center";
    buttony(activationButton)
    activationButton.setAttribute("title", "Switch to a previous version")
    activationButton.addEventListener("click", () => {
        versionPicker.classList.add("--open")
    })

    if (revisionActive) {
        const restoreButton = document.createElement("button")
        restoreButton.style.background = "url(\"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEwLjA1NCAxMC4wNTQiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGc+PHJlY3Qgd2lkdGg9IjEwLjA1NCIgaGVpZ2h0PSIxMC4wNTQiIGZpbGw9IiNhNjRkZWIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEuMSIgc3Ryb2tlLXdpZHRoPSIxLjA1OCIvPjxwYXRoIGQ9Im0yLjAyMTYgNy43NTM1Yy0wLjE0MDMgMC4xMTY2Ny0wLjMzNjczIDAuMTQzMjYtMC41MDM2MSAwLjA2NDk4My0wLjE2Njg5LTAuMDc4Mjc1LTAuMjcxNzQtMC4yNDUxNi0wLjI3MTc0LTAuNDI4Mjl2LTQuNzI2YzAtMC4xODMxMyAwLjEwNjMzLTAuMzUwMDIgMC4yNzE3NC0wLjQyODI5IDAuMTY1NDEtMC4wNzgyNzQgMC4zNjE4My0wLjA1MzE2NyAwLjUwMzYxIDAuMDY0OTgzbDIuNTMyOCAyLjExMDR2MS4yMzE3em0zLjAwNTQtMS4zMDg1di0zLjc4MDhjMC0wLjE4MzEzIDAuMTA2MzMtMC4zNTAwMiAwLjI3MTc0LTAuNDI4MjkgMC4xNjU0MS0wLjA3ODI3NCAwLjM2MTgzLTAuMDUzMTY3IDAuNTAzNjEgMC4wNjQ5ODNsMi44MzU2IDIuMzYzYzAuMTA3ODEgMC4wOTAwODggMC4xNjk4NCAwLjIyMzAxIDAuMTY5ODQgMC4zNjMzMSAwIDAuMTQwMy0wLjA2MjAyOCAwLjI3MzIyLTAuMTY5ODQgMC4zNjMzMWwtMi44MzU2IDIuMzYzYy0wLjE0MDMgMC4xMTY2Ny0wLjMzNjczIDAuMTQzMjYtMC41MDM2MSAwLjA2NDk4My0wLjE2Njg5LTAuMDc4Mjc0LTAuMjcxNzQtMC4yNDUxNi0wLjI3MTc0LTAuNDI4Mjl6IiBzdHJva2Utd2lkdGg9Ii4wMTQ3NjkiLz48L2c+PC9zdmc+Cg==\") no-repeat center";
        buttony(restoreButton)
        restoreButton.addEventListener("click", () => {
            window.swDisable()
        })
        restoreButton.setAttribute("title", "Return to default version")
        footer_bar.insertBefore(restoreButton, append_before)
    }
    footer_bar.insertBefore(activationButton, append_before)
}


async function registerServiceWorker(): Promise<ServiceWorker | false> {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('worker.js', { scope: './' })
            if (registration.installing) {
                console.log('Service worker installing ⌛')
            } else if (registration.waiting) {
                console.log('Service worker waiting to switch in 😴')
            } else if (registration.active) {
                console.log('Service worker active ✅')
            } else {
                throw 'Service worker not registered 😢'
            }
            // more than one of these could be true, we want the newest one
            return <ServiceWorker>(registration.installing || registration.waiting || registration.active);
        } catch (err) {
            console.error('Registration failed 😫', err)
            return false;
        }
    }
    return false;
}


async function preInit() {
    const serviceWorker = await registerServiceWorker()
    if (serviceWorker === false) {
        console.warn("Service worker registration failed.")
        displayError("APIs missing")
        TTJSIntegration.okay = false
        return
    }
    console.info("Service worker register event listener")
    navigator.serviceWorker.addEventListener("message", async (event) => {
        try {
            console.info("SW message received: " + JSON.stringify(event.data))
        } catch (e) {
            console.info("SW message received: " + event.data)
        }
        const packet = event.data as MessagePacket
        if (packet.action == "log") {
            console.log(packet.data)
        } else {
            NetQueue.push(packet)
        }
    })
    // are we up-to-date?
    const version = (await query(serviceWorker, "version", null)).data as VersionSpec
    if (version.major !== VERSION_I.major) {
        console.error("Major version mismatch! Stopping!")
        displayError("Service wrong version")
        TTJSIntegration.okay = false
        return
    }
    if (version.patch < VERSION_I.patch) {
        console.warn("Outdated worker build! Stopping!")
        displayError("Service outdatated")
        TTJSIntegration.okay = false
        return
    }

    return serviceWorker
}

interface Window {
    swSwitch: (versionName: string) => Promise<void>;
    swDisable: () => Promise<void>;
    getWatches: () => typeof wants;
    getAvailableVersions: () => AllManif | null;
}

async function mainInit() {
    // ask to fetch the list of versions
    let sw = navigator.serviceWorker.controller
    while (sw == null || !sw) {
        console.log("SW is not in control yet...")
        await new Promise(resolve => setTimeout(resolve, 50))
        sw = navigator.serviceWorker.controller
    }
    if (sw == null) {
        console.error("No service worker! Stopping!")
        displayError("No service worker")
        TTJSIntegration.okay = false
        return
    }

    console.info("assigning versions to window")
    window.swSwitch = async (versionName) => {
        await query(sw!, "switchOn", versionName)
        document.location.reload()
    }
    window.swDisable = async () => {
        await query(sw!, "switchOff", null)
        document.location.reload()
    }
    console.info("asking for current state info")
    const state = (await query(sw!, "query", null)).data as StateResponse | null
    if (!state) {
        console.error("No state! Stopping!")
        displayError("No state")
        TTJSIntegration.okay = false
        return
    }
    if (state.active) {
        revisionActive = true
        document.body.style.backgroundColor = "#cac7fc"
        if (state.activeSwitch) {
            document.querySelector("#unity-build-title")!.textContent += "@" + state.activeSwitch
        }
    } else {
        document.body.style.backgroundColor = "inherit"
    }

    console.info("asking for versions")
    const versions = (await query(sw!, "getVersions", null)).data as AllManif | null
    if (!versions) {
        console.error("No versions! Stopping!")
        displayError("No revisions")
        TTJSIntegration.okay = false
        return
    }
    versionInfo = versions
    injectDOMElements()
}

window.getWatches = () => wants
window.getAvailableVersions = () => versionInfo


if (window.Worker) {
    console.info("Injection worked! Installing the worker now before the webpage catches up...")
    queueCycler()
    let isLoadedYet = false
    let isSwReady = false
    preInit().then(async sw => {
        if (!sw) {
            return
        }
        setInterval(() => sw.postMessage({ action: "ping", data: null }), 1000)
        navigator.serviceWorker.ready.then(() => isSwReady = true)
        let counter = 0
        while (!(isLoadedYet && isSwReady)) {
            if (counter % 100 === 0) {
                console.warn(`Waiting. loaded? ${isLoadedYet} swReady? ${isSwReady}`)
            }
            counter++;
            await new Promise(resolve => setTimeout(resolve, 10))
        }
        console.info("WE GOOD TO GO")
        if (TTJSIntegration.okay) {
            // keep-alive
            await mainInit()
        } else {
            console.warn("Not okay, not initializing.")
        }
    })
    window.addEventListener("DOMContentLoaded", () => isLoadedYet = true)
} else {
    console.warn("Injection worked, but Web Workers are not supported.")
}
