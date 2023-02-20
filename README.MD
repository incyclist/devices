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
const ant = InterfaceFactory.create('serial',{logger, log:true, binding:autodetect()})
```

__BLE Example__

```
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {WinrtBindings} = require('./bindings')
const Noble = require('noble/lib/noble');


const noble = new Noble(new WinrtBindings())
const logger = new EventLogger('BLESample')
const ant = InterfaceFactory.create('ble',{logger, log:true, binding:noble})
```

### Scan for devices

_TODO_

### Create a device 

_TODO_

### Communicate with a device

_TODO_