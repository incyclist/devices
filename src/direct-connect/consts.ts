// --------------------------------------------
// Response Codes
// --------------------------------------------
export const DC_RC_REQUEST_COMPLETED_SUCCESSFULLY = 0; // Request completed successfully
export const DC_RC_UNKNOWN_MESSAGE_TYPE = 1; // Unknown Message Type
export const DC_RC_UNEXPECTED_ERROR = 2; // Unexpected Error
export const DC_RC_SERVICE_NOT_FOUND = 3; // Service Not Found
export const DC_RC_CHARACTERISTIC_NOT_FOUND = 4; // Characteristic Not Found
export const DC_RC_CHARACTERISTIC_OPERATION_NOT_SUPPORTED = 5; // Characteristic Operation Not Supported (See Characteristic Properties)
export const DC_RC_CHARACTERISTIC_WRITE_FAILED_INVALID_SIZE = 6; // Characteristic Write Failed – Invalid characteristic data size
export const DC_RC_UNKNOWN_PROTOCOL_VERSION = 7; // Unknown Protocol Version – the command contains a protocol version that the device does not recognize
// 8 to 255 Reserved

// --------------------------------------------
// Messages
// --------------------------------------------
export const DC_MESSAGE_DISCOVER_SERVICES = 0x01; // Discover Services
export const DC_MESSAGE_DISCOVER_CHARACTERISTICS = 0x02; // Discover Characteristics
export const DC_MESSAGE_READ_CHARACTERISTIC = 0x03; // Read Characteristic
export const DC_MESSAGE_WRITE_CHARACTERISTIC = 0x04; // Write Characteristic
export const DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS = 0x05; // Enable Characteristic Notifications
export const DC_MESSAGE_CHARACTERISTIC_NOTIFICATION = 0x06; // Characteristic Notification


export const DC_ERROR_INVALID_MESSAGE_TYPE = 1;  // Invalid Message Type
export const DC_ERROR_INVALID_MESSAGE_LENGTH = 2; // Invalid Message Header length
export const DC_ERROR_UNKNOWN_MESSAGE_TYPE = 3; // Unknown Message Type
