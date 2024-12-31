import { Socket } from "net"
import {Service} from './emulator/services'

import {beautifyUUID, CharacteristicNotificationMessage, DC_MESSAGE_CHARACTERISTIC_NOTIFICATION, DC_MESSAGE_DISCOVER_CHARACTERISTICS, DC_MESSAGE_DISCOVER_SERVICES, DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS, DC_MESSAGE_READ_CHARACTERISTIC, DC_MESSAGE_WRITE_CHARACTERISTIC, 
       DC_RC_CHARACTERISTIC_NOT_FOUND, 
       DC_RC_REQUEST_COMPLETED_SUCCESSFULLY, DC_RC_SERVICE_NOT_FOUND, DCMessageFactory, 
       DiscoverCharacteristicsMessage, DiscoverServiceMessage, EnableCharacteristicNotificationsMessage, IllegalMessageError, parseUUID, ReadCharacteristicMessage, TDCDiscoverCharacteristicsRequest,
       TDCDiscoverCharacteristicsResponseBody, TDCDiscoverServicesResponseBody,
       TDCReadCharacteristicRequest,
       TDCReadCharacteristicResponseBody,
       TDCWriteCharacteristicRequest,
       TDCWriteCharacteristicResponseBody,
       WriteCharacteristicMessage} from 'incyclist-devices'


export class DirectConnectComms {

    protected onDataHandler 
    protected socket:Socket
    protected services:Service[]
    protected lastMessageId = 0
    protected subscibeHandlers: Record<string, (data: Buffer) => void> = {}
    

    constructor(socket:Socket,services:Service[]) {

        this.socket = socket
        this.services = services.filter(s=>s!==undefined)

        this.onDataHandler = this.onData.bind(this)
        socket.on('data',this.onDataHandler)
        socket.on('error',(err)=>{
            console.log('server:error ',err)
            
        })
        socket.on('connect',()=>{console.log('connected: ',socket.remoteAddress)})
        socket.on('close',()=>{
            console.log('closed',socket.remoteAddress)
            socket.removeAllListeners()
            socket.destroy()
            this.subscibeHandlers = {}
            delete this.socket
        })
        socket.on('ready',()=>{console.log('ready')})
        socket.on('connectionAttempt',()=>{console.log('connectionAttempt')})    
    }

    write = (respBuffer) => {
        if (!this.socket)
            return;

        const socket = this.socket
        console.log( socket.remoteAddress+ ":OUT< ",respBuffer.toString('hex'))
        socket.write(respBuffer)
    }

    onData (data) {

        const socket = this.socket

        const buffer = Buffer.from(data )
        console.log( socket.remoteAddress+ ": IN> ",buffer.toString('hex'))
        
        try {
            const message = DCMessageFactory.createMessage(buffer)

            this.lastMessageId = buffer.readUInt8(2)

            switch(message.msgId) {
                case DC_MESSAGE_DISCOVER_SERVICES:
                    this.handleDiscoverServices(buffer,message)
                    break;
                case DC_MESSAGE_DISCOVER_CHARACTERISTICS:
                    this.handleDiscoverCharacteristics(buffer,message)
                    break;
                case DC_MESSAGE_READ_CHARACTERISTIC:
                    this.handleReadCharacteristic(buffer,message)
                    break;
    
                case DC_MESSAGE_WRITE_CHARACTERISTIC:
                    this.handleWriteCharacteristic(buffer,message)
                    break;
                case DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS:
                    this.enableCharacteristicNotifications(buffer,message)
                    break

                default: {
                    const request = message.parseRequest(buffer)
                    console.log('request:',message.msgId,request)
                }
            }
            
        }
        catch(err) {
            console.log(err)
            if (err instanceof IllegalMessageError) {
                const respBuffer = DCMessageFactory.buildErrorResponse(buffer,err.code)
                this.write(respBuffer)
            }
        }
    }
        

    handleDiscoverServices (buffer,message:DiscoverServiceMessage) {
        const request = message.parseRequest(buffer)
        console.log('handleDiscoverServices',request, 'services:',this.services.map( s=>s.uuid).join(','))

        
        const serviceDefinitions = ['0x1818','0x1826'].map((uuid) => ({serviceUUID:parseUUID(uuid)}))
        const body:TDCDiscoverServicesResponseBody = {serviceDefinitions}
        const response = message.prepareResponse(request,DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,body)
        const respBuffer = message.buildResponse(response)

        this.write(respBuffer)
    }

    handleDiscoverCharacteristics (buffer,message:DiscoverCharacteristicsMessage) {
        const request:TDCDiscoverCharacteristicsRequest = message.parseRequest(buffer)
        console.log('handleDiscoverCharacteristics',request.body)

        const {serviceUUID} = request.body
        let found = false
        this.services.forEach( s => {            
            if (parseUUID(s.uuid) === parseUUID(serviceUUID)) {
                const characteristicDefinitions = s.characteristics.map((c) => (
                    {   characteristicUUID:parseUUID(c.uuid),
                        properties:c.properties
                    }))
                const body:TDCDiscoverCharacteristicsResponseBody = {serviceUUID,characteristicDefinitions}
                const response = message.prepareResponse(request,DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,body)
                const respBuffer = message.buildResponse(response)
    
                found = true
                this.write(respBuffer)
    
            }
        })

        if (!found) {
            console.log('service not found', serviceUUID, this.services.map( s=>parseUUID(s.uuid)).join(','))
            const body:TDCDiscoverCharacteristicsResponseBody = {serviceUUID,characteristicDefinitions:[]}
            const response = message.prepareResponse(request,DC_RC_SERVICE_NOT_FOUND,body)
            const respBuffer = message.buildResponse(response)
    
            this.write(respBuffer)
    
        }

    }


    handleReadCharacteristic (buffer,message:ReadCharacteristicMessage) {
        const request:TDCReadCharacteristicRequest = message.parseRequest(buffer)
        console.log('ReadCharacteristic',request.body)

        const { characteristicUUID} = request.body
        let found = false

        this.services.forEach( s => {            

            s.characteristics.forEach(char=> {
                if (parseUUID(char.uuid) === parseUUID(characteristicUUID)) {
                    found = true 
                    const characteristicData = Buffer.from(char.value)
                    const body:TDCReadCharacteristicResponseBody = {characteristicUUID,characteristicData}
                    const response = message.prepareResponse(request,DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,body)
                    const respBuffer = message.buildResponse(response)
            
                    this.write(respBuffer)
                
                    
                }
            })
        })

        if (!found) {
            const characteristicData = Buffer.from([])
            const body:TDCReadCharacteristicResponseBody = {characteristicUUID,characteristicData}
            const response = message.prepareResponse(request,DC_RC_CHARACTERISTIC_NOT_FOUND,body)
            const respBuffer = message.buildResponse(response)
    
            this.write(respBuffer)

        }


    }


    handleWriteCharacteristic (buffer,message:WriteCharacteristicMessage) {
        const request:TDCWriteCharacteristicRequest = message.parseRequest(buffer)
        console.log('writeCharacteristic',request.body)

        const { characteristicUUID, characteristicData} = request.body
        let found = false

        this.services.forEach( s => {            

            s.characteristics.forEach(char=> {
                if (parseUUID(char.uuid) === parseUUID(characteristicUUID)) {
                    found = true 
                    char.write(Buffer.from(characteristicData), 0, false, (success,response) => {
                        console.log('writeCharacteristic',success,response)

                        const body:TDCWriteCharacteristicResponseBody = {characteristicUUID}
                        const resp = message.prepareResponse(request,DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,body)
                        const respBuffer = message.buildResponse(resp)
                        this.write(respBuffer)    


                        if (response) {
                            const uuid = parseUUID(characteristicUUID)
                            const callback = this.subscibeHandlers[uuid] 
                            if (callback) {
                                this.notify(characteristicUUID, response)  
                            }
                        }
                
                    })
                }
            })
        })

        if (!found) {
            const body:TDCWriteCharacteristicResponseBody = {characteristicUUID}
            const response = message.prepareResponse(request,DC_RC_CHARACTERISTIC_NOT_FOUND,body)
            const respBuffer = message.buildResponse(response)
    
            this.write(respBuffer)

        }


    }


    enableCharacteristicNotifications(buffer:Buffer, message:EnableCharacteristicNotificationsMessage)  {
        const request = message.parseRequest(buffer)
        const {characteristicUUID,enable} = request.body
        let found = false

        this.services.forEach( s => {            
            s.characteristics.forEach(char=> {
                if (parseUUID(char.uuid) === parseUUID(characteristicUUID)) {
                    found = true                    
                    console.log('enableCharacteristicNotifications',beautifyUUID(characteristicUUID), enable)
                    if (enable) {
                        const callback = characteristicData => {
                            this.notify(characteristicUUID, characteristicData)
                        }
                        const uuid = parseUUID(characteristicUUID)
                        this.subscibeHandlers[uuid] = callback
                        char.subscribe( callback)                                
                        
                    }
                    else {
                        const uuid = parseUUID(characteristicUUID)
                        const callback = this.subscibeHandlers[uuid] 
                        
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete this.subscibeHandlers[uuid]
                        char.unsubscribe( callback)
                    }
                }

            })
        })

        const body = {characteristicUUID}
        const respCode = found ?DC_RC_REQUEST_COMPLETED_SUCCESSFULLY : DC_RC_CHARACTERISTIC_NOT_FOUND
        const response = message.prepareResponse(request,respCode,body)
        const respBuffer = message.buildResponse(response)
        this.write(respBuffer)
        console.log('enableCharacteristicNotifications response',beautifyUUID(characteristicUUID))


    }

    notify(characteristicUUID: string, characteristicData: Buffer) {
        const notifyMsg = new CharacteristicNotificationMessage()
        const body = notifyMsg.buildResponseBody({
            characteristicUUID, characteristicData
        })

        const seqNum = (this.lastMessageId + 1) % 256
        this.lastMessageId = seqNum

        const header = notifyMsg.buildHeader({
            msgVersion:1,                
            msgId:DC_MESSAGE_CHARACTERISTIC_NOTIFICATION,
            seqNum,
            respCode:DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,
            length: body.length
        },                                    
        body.length)

        const response = Buffer.concat([header, body])
        this.write(response)

        
    }

    // handleWriteCharacteristic (buffer,message:WriteCharacteristicMessage) {
    //     // 
    // }

}
