// noble-winrt
// Copyright (C) 2017, Uri Shaked
// License: MIT
const { spawn } = require('node:child_process');
const nativeMessage = require('chrome-native-messaging');
const events = require('node:events');
const { EventLogger } = require('gd-eventlog');
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const BLE_SERVER_EXE = path.resolve(__dirname, 'prebuilt', 'BLEServer.exe');

const DEFAULT_UPDATE_SERVER_URL_DEV  = 'http://localhost:4000';
const DEFAULT_UPDATE_SERVER_URL_PROD = 'https://updates.incyclist.com';
const DEFAULT_UPDATE_SERVER_URL = process.env.ENVIRONMENT=='dev' ? DEFAULT_UPDATE_SERVER_URL_DEV : DEFAULT_UPDATE_SERVER_URL_PROD;

const server = DEFAULT_UPDATE_SERVER_URL;

const uuid = (s) => {
    //console.log(s)
    if (s) {
        if (s.includes('-')) {
            const parts = s.split('-')
            const uuidNo = Number('0x'+parts[0])
            return uuidNo.toString(16)
        }
        return s;
    }
}

function toWindowsUuid(uuid) {
    return '{' + uuid + '}';
}

function fromWindowsUuid(winUuid) {
    
    return winUuid.replace(/\{|\}/g, '');

}


class WinrtBindings extends events.EventEmitter {
    static _instance
    
    constructor(appDirectory) { 
        super();
        this.logger = new EventLogger('BLE');
        this.app = BLE_SERVER_EXE;
        this.appDirectory = appDirectory;        
        
    }

    static getInstance(appDirectory) {
        if (!WinrtBindings._instance) {
            WinrtBindings._instance = new WinrtBindings(appDirectory);
        }
        return WinrtBindings._instance;
    }

    logEvent(e) {
        this.logger.logEvent(e)
        if (process.env.BLE_DEBUG) {
            console.log('~~BLEServer:',e)
        }
    }



    getName(headers) {
        if (!headers || !headers['content-disposition'])
            return undefined;

        let fileName =  headers['content-disposition'].split('filename=')[1];
        fileName = fileName.replace(/\"/g, '')
        return fileName
    }


    initBleServer() {
        this._bleServer.stdout
        .pipe(new nativeMessage.Input())
        .on('data', (data) => {
            this._processMessage(data);
        });
        this._bleServer.stderr.on('data', (data) => {
            console.error('BLEServer:', data);
        });
        this._bleServer.on('close', (code) => {
            this.state = 'poweredOff';
            this.emit('stateChange', this.state);
        });
        this._bleServer.stdin.on('error', (err) => { 
            console.error('BLEServer:', err);
        })
        this._bleServer.stdout.on('error', (err) => { 
            console.error('BLEServer:', err);
        })
    }

    async init() {
        this.logEvent({message:'init',app:this.app});

        try {
            this._prevMessage = '';
            this._deviceMap = {};
            this._requestId = 0;
            this._requests = {};
            this._subscriptions = {};
            if (this.app) {
                this._bleServer = spawn(this.app, ['']);
                this.initBleServer();
            }    
    
        }
        catch (err) {
            this.logEvent({message:'error',fn:'init()', err: err.message,stack: err.stack});
            this.emit('error',err)
        }
    }

    startScanning() {
        this.scanResult = {};
        this._sendMessage({ cmd: 'scan' });
    }

    stopScanning() {
        this._sendMessage({ cmd: 'stopScan' });
    }

    connect(address) {
        
        
        this._sendRequest({ cmd: 'connect', 'address': address })
            .then(result => {
                this._deviceMap[address] = result;
                this.emit('connect', address, null);
            })
            .catch(err => this.emit('connect', address, err));
    }

    disconnect(address) {
        this._sendRequest({ cmd: 'disconnect', device: this._deviceMap[address] })
            .then(result => {
                this._deviceMap[address] = null;
                this.emit('disconnect', address, null);
            })
            .catch(err => this.emit('disconnect', address, err));
    }

    discoverServices(address, filters = []) {
        this._sendRequest({ cmd: 'services', device: this._deviceMap[address] })
            .then(result => {
    
                const sids = result.map(fromWindowsUuid).map( s => ({uuid:s, uuid_short:uuid(s)}))
                let services = result.map(fromWindowsUuid)
                if (filters && filters.length>0) {                       
                    services = sids.filter( (s) => filters.find(sid => s.uuid_short===sid) ).map(s=>s.uuid)
                }
                   
                this.emit('servicesDiscover', address, services);
            })
            .catch(err => this.emit('servicesDiscover', address, err));
    }

    discoverCharacteristics(address, service, filters = []) {
        this._sendRequest({
            cmd: 'characteristics',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
        })
            .then(result => {
                this.logEvent({message: 'BLEServer characteristics:', info: result.map( c => `${address} ${service} ${fromWindowsUuid(c.uuid)}  ${Object.keys(c.properties).filter(p => c.properties[p])}`)});


                // TODO filters
                this.emit('characteristicsDiscover', address, service,
                    result.map(c => ({
                        uuid: fromWindowsUuid(c.uuid),
                        properties: Object.keys(c.properties).filter(p => c.properties[p])
                    })));
            })
            .catch(err => this.emit('characteristicsDiscover', address, service, err));
    }

    read(address, service, characteristic) {
        this._sendRequest({
            cmd: 'read',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic)
        })
            .then(result => {
                this.emit('read', address, service, characteristic, Buffer.from(result), false);
            })
            .catch(err => {
                console.log('~~ read error',toWindowsUuid(characteristic), err )
                this.emit('read', address, service, characteristic, err, false)
            });

    }

    write(address, service, characteristic, data, withoutResponse) {
        // TODO data, withoutResponse
        this._sendRequest({
            cmd: 'write',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic),
            value: Array.from(data),
        })
            .then(result => {
                this.emit('write', address, service, characteristic);
            })
            .catch(err => this.emit('write', address, service, characteristic, err));
    }

    notify(address, service, characteristic, notify) {
        this._sendRequest({
            cmd: notify ? 'subscribe' : 'unsubscribe',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic)
        })
            .then(result => {
                if (notify) {
                    this._subscriptions[result] = { address, service, characteristic };
                } else {
                    // TODO - remove from subscriptions
                }
                this.emit('notify', address, service, characteristic, notify);
            })
            .catch(err => this.emit('notify', address, service, characteristic, err));
    }

    _processMessage(message) {
        this.logEvent( {message:'BLEserver in:', msg:message});
        switch (message._type) {
            case 'Start':
                this.state = 'poweredOn';
                this.emit('stateChange', this.state);
                break;

            case 'scanResult':
                const address =   message.bluetoothAddress;
                const advType = message.advType;
                const uuid = message.bluetoothAddress.replace(/:/g, '')
                const advertisement = {
                    localName: message.localName,
                    txPowerLevel: 0,
                    manufacturerData: null,
                    serviceUuids: message.serviceUuids.map(fromWindowsUuid),
                    serviceData: [],
                };
            
                switch ( advType) {
                    case 'NonConnectableUndirected': 
                        break;
                    case 'ConnectableUndirected':
                    case 'ScanableUndirected':
                        this.scanResult[address] = { uuid, address,advertisement }
                        break;
                    case 'ScanResponse':
                        let d =  this.scanResult[address];
                        if (!d) 
                            d = this.scanResult[address] = { uuid, address,advertisement }
                        else {
                            if (d.advertisement.localName==='' && advertisement.localName!=='') 
                                d.advertisement.localName = advertisement.localName
                            if (advertisement.serviceUuids) 
                                advertisement.serviceUuids.forEach( sid => { 
                                    if (!d.advertisement.serviceUuids)
                                        d.advertisement.serviceUuids = []
                                    if (!d.advertisement.serviceUuids.find( sid1 => sid1===sid))
                                        d.advertisement.serviceUuids.push(sid)                                    
                                }) 
                        }

                        this.emit(
                            'discover',
                            uuid,
                            address,
                            'public', // TODO address type
                            true, // TODO connectable
                            d.advertisement,
                            message.rssi);
                        break;
        
                }  
                break;

                

            case 'response':
                if (this._requests[message._id]) {
                    if (message.error) {
                        this._requests[message._id].reject(new Error(message.error));
                    } else {
                        let result = message.result;
                        this._requests[message._id].resolve(result);
                    }
                    delete this._requests[message._id];
                }
                else if (this._prevMessage && this._prevMessage.cmd === 'scan')   {
                    this.emit('scanStart',false);
                }
                else if (this._prevMessage && this._prevMessage.cmd === 'stopScan')   {
                    this.emit('scanStop',false);
                }
                break;

            case 'disconnectEvent':
                this.logEvent( {message: 'disconnect'})
                for (let address of Object.keys(this._deviceMap)) {
                    if (this._deviceMap[address] == message.device) {
                        this.emit('disconnect', address);
                    }
                }
                break;

            case 'valueChangedNotification':
               
            const subscription  = this._subscriptions[message.subscriptionId]
            if (subscription) {
                const { address, service, characteristic } = subscription;

               
                this.emit('read', address, service, characteristic, Buffer.from(message.value), true);
            }
            break;
        }
    }

    _sendMessage(message) {
        this.logEvent({message: 'BLEServer out:', msg:message});
        this._prevMessage = message
        const dataBuf = Buffer.from(JSON.stringify(message), 'utf-8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeInt32LE(dataBuf.length, 0);
        this._bleServer.stdin.write(lenBuf);
        this._bleServer.stdin.write(dataBuf);
    }

    _sendRequest(message) {
        return new Promise((resolve, reject) => {
            const requestId = this._requestId++;
            this._requests[requestId] = { resolve, reject };
            this._sendMessage(Object.assign({}, message, { _id: requestId }));
        });
    }
}

exports.WinrtBindings = WinrtBindings;


