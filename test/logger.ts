import {EventLogger} from 'gd-eventlog'

export const MockLogger = {
    logEvent: jest.fn(),
    log: jest.fn(),

    init: jest.fn(),
    getName: jest.fn(() => 'mock'),
    getParent: jest.fn(),
    setContext: jest.fn(),
    set: jest.fn(),
    setGlobal: jest.fn(),
    createEvent: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    filterBlackList: jest.fn(() => ({}))
} as unknown as EventLogger

