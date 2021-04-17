const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
EventLogger.registerAdapter(new ConsoleAdapter()) 

const {scan} = require('./scan')



scan().then(()=> process.exit())
