/**
 * Parses command-line arguments for the BLE forwarder tool.
 *
 * The expected arguments are:
 * - `-?`, `--help`: Prints usage information.
 * - `-n X`, `--name X`: Defines the name of the device that should be forwarded (mandatory).
 * - `-a X`, `--announce X`: Defines the name of the forwarded device to be announced (optional, default: "BLE-FM SIM").
 *
 * @returns An object containing the `configFile` property, which is the first argument after the script name.
 */
export const parseArgs = () => {
    const args = process.argv.slice(2);
    let deviceName: string | undefined;
    let announceName: string = "BLE-FM SIM";

    const printUsage = () => {
        console.log('Usage:\n  node index.js -n <deviceName> [-a <announceName>]');
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '-?':
            case '--help':
                printUsage();
                process.exit(0);
                break;
            case '-n':
            case '--name':
                deviceName = args[++i];
                break;
            case '-a':
            case '--announce':
                announceName = args[++i];
                break;
            default:
                break;
        }
    }

    if (!deviceName) {
        console.error('Error: Device name is required. \n');
        printUsage();
        process.exit(1);
    }
    // following args are allowed
    // -?, --help:      prints usage
    // -n X, --name X:  defines the name of the device that should be forwarded (mandatory)
    // -a X, --announce X: defined the name of the forwarded the device to be announced (optional, default: BLE-FM SIM)
    return { deviceName, announceName };
};
