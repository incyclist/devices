import { AntScanner } from "./AntScanner"

const TestData = [
    {"busNumber":2,"deviceAddress":3,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":512,"bDeviceClass":0,"bDeviceSubClass":0,"bDeviceProtocol":0,"bMaxPacketSize0":32,"idVendor":4047,"idProduct":4104,"bcdDevice":256,"iManufacturer":1,"iProduct":2,"iSerialNumber":3,"bNumConfigurations":1},"portNumbers":[1,2],"inUse":false},
    {"busNumber":1,"deviceAddress":5,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":512,"bDeviceClass":0,"bDeviceSubClass":0,"bDeviceProtocol":0,"bMaxPacketSize0":8,"idVendor":1133,"idProduct":49174,"bcdDevice":832,"iManufacturer":1,"iProduct":2,"iSerialNumber":0,"bNumConfigurations":1},"portNumbers":[1],"inUse":false},
    {"busNumber":2,"deviceAddress":4,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":512,"bDeviceClass":239,"bDeviceSubClass":2,"bDeviceProtocol":1,"bMaxPacketSize0":64,"idVendor":1266,"idProduct":46094,"bcdDevice":26937,"iManufacturer":2,"iProduct":1,"iSerialNumber":0,"bNumConfigurations":1},"portNumbers":[1,3],"inUse":false},
    {"busNumber":2,"deviceAddress":5,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":528,"bDeviceClass":224,"bDeviceSubClass":1,"bDeviceProtocol":1,"bMaxPacketSize0":64,"idVendor":3034,"idProduct":45057,"bcdDevice":512,"iManufacturer":1,"iProduct":2,"iSerialNumber":3,"bNumConfigurations":1},"portNumbers":[1,7],"inUse":false},
    {"busNumber":1,"deviceAddress":9,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":512,"bDeviceClass":0,"bDeviceSubClass":0,"bDeviceProtocol":0,"bMaxPacketSize0":32,"idVendor":4047,"idProduct":4104,"bcdDevice":256,"iManufacturer":1,"iProduct":2,"iSerialNumber":3,"bNumConfigurations":1},"portNumbers":[6],"inUse":false},
    {"busNumber":2,"deviceAddress":2,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":512,"bDeviceClass":9,"bDeviceSubClass":0,"bDeviceProtocol":1,"bMaxPacketSize0":64,"idVendor":32903,"idProduct":32768,"bcdDevice":4,"iManufacturer":0,"iProduct":0,"iSerialNumber":0,"bNumConfigurations":1},"portNumbers":[1],"inUse":false},
    {"busNumber":2,"deviceAddress":1,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":0,"bDeviceClass":9,"bDeviceSubClass":0,"bDeviceProtocol":0,"bMaxPacketSize0":0,"idVendor":32902,"idProduct":39974,"bcdDevice":0,"iManufacturer":0,"iProduct":0,"iSerialNumber":0,"bNumConfigurations":1},"inUse":false},
    {"busNumber":1,"deviceAddress":1,"deviceDescriptor":{"bLength":18,"bDescriptorType":1,"bcdUSB":0,"bDeviceClass":9,"bDeviceSubClass":0,"bDeviceProtocol":0,"bMaxPacketSize0":0,"idVendor":32902,"idProduct":39985,"bcdDevice":0,"iManufacturer":0,"iProduct":0,"iSerialNumber":0,"bNumConfigurations":1},"inUse":false}
]


class MockAnt {
    static getSticks() { return TestData }
}

describe('AntScanner',()=> {
    const scanner = AntScanner(MockAnt);

    test('getSticks',()=> {

    })

})