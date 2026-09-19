'use strict'

const DEFAULT_MAX_PACKET_SIZE = 16 * 1024 * 1024
const MAX_BUFFER_SIZE = require('buffer').constants.MAX_LENGTH

function validateMaxPacketSize (maxPacketSize = DEFAULT_MAX_PACKET_SIZE) {
  if (!Number.isSafeInteger(maxPacketSize) || maxPacketSize < 1 || maxPacketSize > MAX_BUFFER_SIZE) {
    throw new RangeError(`maxPacketSize must be a positive safe integer no greater than ${MAX_BUFFER_SIZE}`)
  }
  return maxPacketSize
}

module.exports = {
  DEFAULT_MAX_PACKET_SIZE,
  validateMaxPacketSize
}
