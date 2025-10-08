
export type HubRequest = {
    DataId    : number
}

export type IHubHelper = {
    createHubRequest(request:HubRequest)
}