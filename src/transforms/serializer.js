'use strict'

const { ProtoDef, Serializer, FullPacketParser } = require('protodef')
const { ProtoDefCompiler } = require('protodef').Compiler

const nbt = require('prismarine-nbt')
const minecraft = require('../datatypes/minecraft')
const states = require('../states')
const merge = require('lodash.merge')

const minecraftData = require('minecraft-data')
const protocols = {}

function createProtocol (state, direction, version, customPackets, compiled = true) {
  const key = `${state};${direction};${version}${compiled ? ';c' : ''}`
  if (protocols[key]) { return protocols[key] }

  const mcData = minecraftData(version)
  const versionInfo = minecraftData.versionsByMinecraftVersion.pc[version]
  if (mcData === null) {
    throw new Error(`No data available for version ${version}`)
  } else if (versionInfo && versionInfo.version !== mcData.version.version) {
    // The protocol version returned by node-minecraft-data constructor does not match the data in minecraft-data's protocolVersions.json
    throw new Error(`Unsupported protocol version '${versionInfo.version}' (attempted to use '${mcData.version.version}' data); try updating your packages with 'npm update'`)
  }

  const mergedProtocol = merge(mcData.protocol, customPackets?.[mcData.version.majorVersion] ?? {})

  if (compiled) {
    const compiler = new ProtoDefCompiler()
    compiler.addTypes(require('../datatypes/compiler-minecraft'))
    compiler.addProtocol(mergedProtocol, [state, direction])
    nbt.addTypesToCompiler('big', compiler)
    const proto = compiler.compileProtoDefSync()
    protocols[key] = proto
    return proto
  }

  const proto = new ProtoDef(false)
  proto.addTypes(minecraft)
  proto.addProtocol(mergedProtocol, [state, direction])
  nbt.addTypesToInterperter('big', proto)
  protocols[key] = proto
  return proto
}

function createSerializer ({ state = states.HANDSHAKING, isServer = false, version, customPackets, compiled = true } = {}) {
  const proto = createProtocol(state, !isServer ? 'toServer' : 'toClient', version, customPackets, compiled)
  const serializer = new Serializer(proto, 'packet')
  const mcData = minecraftData(version)

  // Since 1.21.5, set_creative_slot uses UntrustedSlot. Its component type
  // is still written normally, but the component payload is a length-prefixed
  // byte array instead of the typed SlotComponent payload used by regular
  // slots. Accept the public typed component shape here and encode the payload
  // before it reaches the generated UntrustedSlot serializer.
  if (!isServer && mcData.protocol.types.UntrustedSlotComponent) {
    const createPacketBuffer = serializer.createPacketBuffer.bind(serializer)
    serializer.createPacketBuffer = packet => createPacketBuffer(prepareUntrustedSlotPacket(packet, proto))
  }

  return serializer
}

function prepareUntrustedSlotPacket (packet, proto) {
  if (packet?.name !== 'set_creative_slot' || !packet.params?.item?.components?.length) return packet

  const item = packet.params.item
  const components = item.components.map(component => {
    if (Buffer.isBuffer(component.data)) return component

    const encoded = proto.createPacketBuffer('SlotComponent', component)
    const typeSize = proto.sizeOf(component.type, 'SlotComponentType')
    return { ...component, data: encoded.subarray(typeSize) }
  })

  return {
    ...packet,
    params: {
      ...packet.params,
      item: { ...item, components }
    }
  }
}

function createDeserializer ({ state = states.HANDSHAKING, isServer = false, version, customPackets, compiled = true, noErrorLogging = false } = {}) {
  return new FullPacketParser(createProtocol(state, isServer ? 'toServer' : 'toClient', version, customPackets, compiled), 'packet', noErrorLogging)
}

module.exports = {
  createSerializer,
  createDeserializer
}
