# incyclist-devices

Library used by the [Incyclist](https://incyclist.com) Indoor Cycling App to communicate with devices (Smart Trainers,  Sensors)

It currently support the following Interfaces/Devices

__ANT__
- Smart Trainers (ANT+ FE)
- Power Meters (ANT+PWR)
- Heartrate Monitors (ANT+HR)
- Cadence Sensors (ANT+CAD)
- Speed Sensors (ANT+SPD)
- Speed + Cadence Sensors (ANT+SC)

__BLE__
- Smart Trainers (BLE FTMS)
- Power Meters (BLE CP)
- Heartrate Monitors (BLE HR)
- Wahoo Smart Trainers (Wahoo specific service)
- Tacx FE-C over BLE

__Direct Connect (Wifi)__
- Smart Trainers (FTMS)
- Power Meters (CP)
- Heartrate Monitors (HR)

__Serial__
- Daum Classic Ergo Bikes
- Daum Premium Ergo Bikes  (also over TCP/IP)
- Kettler Ergo Racer Ergo Bikes


## Install

```sh
npm install incyclist-devices
```

## Usage

### Setup Interfaces and Bindings

`Interface` classes are used to enable basic communication (transport layer).

As this library supports various OS( Linux, Windows, Mac) and Incyclist is based on Electron, which requires to clearly separate between rendering and main process, Bindings need to be provided for each of the Interfaces. The specifications of these bindings are specific to the interface: 
- Ant: specified by the [incyclist-ant-plus](https://github.com/incyclist/ant-plus) library
- Serial: specified by the [serialport](https://serialport.io/) library
- BLE: specified by the [noble](https://github.com/noble/noble) library
- Wifi: a combination of Multicast DNS as provided by the [Bonjour](https://github.com/onlxltd/bonjour-service) library and createSocket() wich creates a Socket class from NodeJS net module

__Ant Example__

```
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {AntDevice} = require('incyclist-ant-plus/lib/bindings');

const logger = new EventLogger('AntSample')
const ant = InterfaceFactory.create('ant',{logger, log:true, binding:AntDevice})
```

__Serial Example__

```
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const { autoDetect } = require('@serialport/bindings-cpp')


const logger = new EventLogger('SerialSample')
const serial = InterfaceFactory.create('serial',{logger, log:true, binding:autodetect()})
```

__BLE Example__

```
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {WinrtBindings} = require('./bindings')
const Noble = require('noble/lib/noble');


const noble = new Noble(new WinrtBindings())
const logger = new EventLogger('BLESample')
const ble = InterfaceFactory.create('ble',{logger, log:true, binding:noble})
```

__Direct Connect Example__
```
const { Bonjour } = require('bonjour-service')
const net = require('net');

const createBinding = ()=>{
    return {
        mdns: new MDNSBinding(),
        net: {
            createSocket: ()=>new net.Socket()
        } 
    }
}

class MDNSBinding {
    
    connect() {
        this.bonjour = new Bonjour()
        
    }

    disconnect() {
        if (this.bonjour) {
            this.bonjour.destroy()
            this.bonjour = null
        }
    }

    find(opts , onUp) {
        this.bonjour.find(opts, (s)=>{ 
            this.handleAnnouncement(s,onUp) 
        })
    }       

    handleAnnouncement(service,callback) {
        const {name,txt,port,referer,protocol} = service
        const announcement = {
            name,address:referer?.address,protocol,port,
            serialNo:txt?.['serial-number'], 
            serviceUUIDs:txt?.['ble-service-uuids']?.split(',')
        }
        if (callback)
            callback(announcement)
    }
        
}
```


### Check availability of interface

For some interfaces (ANT and BLE) it cannot be guaranteed that the underlying hardware supports the interface ( e.g. a USB stick might be required). Therefore this library offers a `connect` method, that allows to check if the interface is availabe

__Ant Example__
```
    const connected = await ant.connect() // tries to establish communication and blocks USB stick for usage with other apps
    if (connect) {
        .... 
        await ant.disconnect() // closes communication and unblocks USB stick
    }
    else {
        ... 
    }
```

### Scan for devices

Every interface offers a method `scan` that allows to scan for devices. The timeout for the scan can be specified in the properties. If those are not provided, a default will apply.

The scan method returns a `Promise<DeviceSettings[]>` containing the settings of all detected devices. 

In addition to that, all devices that are detected, will be emitted as `device` event during the scan.

The method `stopScan`can be used to stop an ongoing scan.

__Examples__

- Example 1: wait for teh result of the scan

    ```
    _interface.on('device',(deviceSettings:DeviceSettings)=>{console.log('Device found', DeviceSettings)})
    const devices = await _interface_.scan({timeout:20000})
    console.log(devices)
    ```
- Example 2: stop scan as soon as one device was found

    ```
    _interface.on('device',async (deviceSettings:DeviceSettings)=>{
        console.log('Device found', DeviceSettings)
        await _interface.stopScan()
    })
    _interface_.scan({timeout:20000})    
    ```



### Create a device 

The Devices library provides and `AdapterFactory`, which allows you to create a device adapters, based on the specifications provided in a `DeviceSettings` object. 

The exact content if this object varies between the interfaces:

- __Ant__: interface ('ant'), profile( one of 'HR','PWR', 'FE'), deviceID

- __BLE__: interface ('ble'), protocol( one of 'fm','cp,'hr', 'tacx', 'wahoo'), name, id or address

- __Serial__: interface('serial' or 'tcpip'), protocol( one of 'Daum Premium', 'Daum Classic', 'Kettler Racer'), name, port, host (only for TCP/IP)

These device adapters are used by Incyclist to communicate with the devices. The AdapterFactory will ensure that for a given device only one instance of a device adapter will be provided, to avoid that two classes will concurrently communicate with the same physical device.

At the point where a device adapter is created, the constructor will _not_ try to communicate with the device. I.e. the adapter can be created even if no such device is available/connected.

__Example__

```
const {AdapterFactory} = require('incyclist-devices')

const device = AdapterFactory.create({interface:'ble, protocol:'fm', name:'KICKR BIKE 1234'})
```



### Communicate with a device

In order to commuicate with the device, the device firstly has to be started


#### __start( props?: DeviceProperties):Promise\<boolean\>__


you then should register for events:

- __data__ (device:DeviceSettings, data: DeviceData): is emitted whenever a device/sensor has sent data 
    - device: describes the device that has sent data
    - data: provides the data that the device/sensor has provided (power, speed, cadence,slope, heartrate, timestamp,... )

- __disconnected__ (device:DeviceSettings): is emitted when the library has not recieved any udate for a configurable time or the underlying interface has recognized a connection loss
    - device: describes the device that has sent data

- __device-info__- (device:DeviceSettings, info:): signals that additional information about the device was received ( e.g. manufacturer, additional features/capabilities)
    - device: describes the device that has sent data


```
try {
    await device.start({timeout:5000, userWeight:90,bikeWeight:10})
    device.on('data',(deviceInfo,data)=> { console.log('device data', deviceInfo,data) })
    device.on('disconnected',(deviceInfo)=> { 
        console.log('device disconnected', deviceInfo) 
        // check if reconnect makes sense
        device.disconnect()
    })
}
catch(err) {
    console.log('device could not be started, reason', err.message)
}
```

#### __setMaxUpdateFrequency(ms:number):void__
#### __getMaxUpdateFrequency():number__

BLE and ANT devices might send data more frequently than you mihgt want to process in your app. Therefore you can control how often you want to receive updates from a device. 

Default value is 1s

A value of -1 indicates that the app wants to receive any data without delays

```
device.setMaxUpdateFrequency(1000) // send update every 1000ms
const updateFrequency = device.getMaxUpdateFrequency()
```


#### __setPullFrequency(ms:number):void__
#### __getPullFrequency():number__

Serial Devices are typically not automatically sending data, but the app has to actively pull. Therefore the Serial device adapters also offer the capability to control how often the library will pull data from the device

Default value is 1s

_Warning_: Setting this value to low might overload the serial port and you might not receive any data

#### __stop():Promise\<boolean\>__

Once the commeunication is not required anymore, you can call stop() to close the connection. This will also automatically unregister the event listeners. 


#### __pause():Promise\<boolean\>__
#### __resume():Promise\<boolean\>__

In some cases it might sense to not further receive any update from the device, but still keep the communication open. In thise case, pause() and resume() can be called. 

During a paused state, no event will be emitted

#### __sendUpdate(request:UpdateRequest):Promise\<boolean\>__

Allows to send data to the device, typically one of the following data will be sent

__slope__: (SIM Mode) sets the slope/incline. The smart trainer then will adjust power accordingly

__targetPower__: (ERG Mode) sets the power that the smart trainer should 

__reset__: returns to the default settings at the start of the training

__resfresh__: repeats the previous update

This method should only be called for SmartTrainers or PowerMeters


## Examples

Please have a look at the [example code](./samples)
