# incyclist-devices

Library used by the [Incyclist](https://incyclist.com) Indoor Cycling App to communicate with devices (Smart Trainers,  Sensors)

It currently support the following Interfaces/Devices

__ANT__
- Smart Trainers (ANT+ FE)
- Power Meters (ANT+PWR)
- Heartrate Monitors (ANT+HR)

__BLE__
- Smart Trainers (BLE FTMS)
- Power Meters (BLE CP)
- Heartrate Monitors (BLE HR)
- Wahoo Smart Trainers (Wahoo specific service)
- Tacx FE-C over BLE

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

### Check availability of interface

For some interfaces (ANT and BLE) it cannot be guaranteed that the underlying hardware supports the interface ( e.f. a USB stick might be required). Therefore this library offers a `connect` method, that allows to check if the interface is availabe

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

At the point a device adapter is created, it has not yet been tried to communicate with the device. I.e. the adapter can be created even if there is such device available

__Example__

```
const {AdapterFactory} = require('incyclist-devices')

const device = AdapterFactory.create({interface:'ble, protocol:'fm', name:'KICKR BIKE 1234'})
```



### Communicate with a device

_TODO_