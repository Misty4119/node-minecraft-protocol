/* eslint-env mocha */

const assert = require('assert')
const minecraftProtocol = require('../')
const minecraftDatatypes = require('../src/datatypes/minecraft')

describe('Minecraft Java 26.3 protocol support', function () {
  it('advertises 26.3 as its latest supported default version', function () {
    assert.ok(minecraftProtocol.supportedVersions.includes('26.3'))
    assert.strictEqual(minecraftProtocol.defaultVersion, '26.3')
  })

  it('round-trips legacy and stepped entity movement deltas', function () {
    const [readEntityDelta, writeEntityDelta, sizeOfEntityDelta] = minecraftDatatypes.entityDelta
    const values = [
      { onGround: true, steps: [{ dX: -128, dY: 64, dZ: 3 }] },
      {
        onGround: false,
        steps: [
          { ticks: 0, dX: 1, dY: -2, dZ: 3 },
          { ticks: 7, dX: -4, dY: 5, dZ: -6 }
        ]
      }
    ]

    for (const value of values) {
      const size = sizeOfEntityDelta(value)
      const buffer = Buffer.alloc(size)
      assert.strictEqual(writeEntityDelta(value, buffer, 0), size)
      assert.deepStrictEqual(readEntityDelta(buffer, 0).value, value)
      assert.strictEqual(readEntityDelta(buffer, 0).size, size)
    }

    assert.throws(() => sizeOfEntityDelta({ onGround: false, steps: [] }), /at least one movement step/)
    assert.throws(() => readEntityDelta(Buffer.from([0x04, 0, 0, 0, 0, 0, 0, 0]), 0), /step count/)
  })

  it('accepts vanilla 26.3 truncated component container content', function () {
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3' })
    const packet = Buffer.concat([
      Buffer.from('12010127', 'hex'),
      Buffer.alloc(27),
      Buffer.from('019a080000', 'hex'),
      Buffer.from('01f30a01002d012105', 'hex'),
      Buffer.alloc(9)
    ])

    const parsed = deserialize.parsePacketBuffer(packet)
    assert.strictEqual(parsed.data.name, 'window_items')
    assert.strictEqual(parsed.data.params.items.length, 39)
    assert.deepStrictEqual(parsed.data.params.items[27], {
      itemCount: 1,
      itemId: 1050,
      addedComponentCount: 0,
      removedComponentCount: 0,
      components: [],
      removeComponents: []
    })
    assert.deepStrictEqual(parsed.data.params.items[28].components, [{
      type: 'stored_enchantments',
      data: { enchantments: [{ id: 33, level: 5 }] }
    }])
    assert.deepStrictEqual(parsed.data.params.carriedItem, { itemCount: 0 })
    assert.strictEqual(parsed.metadata.size, packet.length)
  })

  it('consumes the 26.3 team and explosion packet tails', function () {
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3', noErrorLogging: true })
    const teamPacket = Buffer.from('6f0474657374000800047465737408000008000000000102030107666c6174626f74', 'hex')
    const explosionPacket = Buffer.from('243fe0000000000000c04d8000000000003ff800000000000040c00000000005ee0100000000000000003fc7ccbdad2fe204bfd331802e5a08d31dc00502453f0000003f80000001483f8000003f8000000101', 'hex')

    const team = deserialize.parsePacketBuffer(teamPacket)
    const explosion = deserialize.parsePacketBuffer(explosionPacket)

    assert.strictEqual(team.metadata.size, teamPacket.length)
    assert.deepStrictEqual(team.data.params.players, ['flatbot'])
    assert.strictEqual(team.data.params.color, 2)
    assert.strictEqual(explosion.metadata.size, explosionPacket.length)
    assert.strictEqual(explosion.data.params.playSound, true)
  })

  it('round-trips the 26.3 use_entity interaction flag', function () {
    const serialize = minecraftProtocol.createSerializer({ state: 'play', version: '26.3' })
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', isServer: true, version: '26.3', noErrorLogging: true })
    const packet = serialize.createPacketBuffer({
      name: 'use_entity',
      params: {
        target: 1,
        hand: 'main_hand',
        location: { x: 0, y: 0, z: 0 },
        usingSecondaryAction: true
      }
    })

    assert.strictEqual(deserialize.parsePacketBuffer(packet).data.params.usingSecondaryAction, true)
  })

  it('round-trips the 26.3 beehive occupant entity type before NBT', function () {
    const data = require('minecraft-data')('26.3')
    const beeId = data.entitiesByName.bee.id
    assert.strictEqual(beeId, 11)

    const occupant = {
      entityType: beeId,
      nbtData: {
        type: 'compound',
        name: '',
        value: { CustomName: { type: 'string', value: 'test bee' } }
      },
      ticksInHive: 130,
      minTicksInHive: 7
    }
    const serialize = minecraftProtocol.createSerializer({ state: 'play', isServer: true, version: '26.3' })
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3', noErrorLogging: true })
    const packet = serialize.createPacketBuffer({
      name: 'set_slot',
      params: {
        windowId: 0,
        stateId: 1,
        slot: 0,
        item: {
          itemCount: 1,
          itemId: data.itemsByName.bee_nest.id,
          addedComponentCount: 1,
          removedComponentCount: 0,
          components: [{ type: 'bees', data: { bees: [occupant] } }],
          removeComponents: []
        }
      }
    })
    const parsed = deserialize.parsePacketBuffer(packet)

    assert.strictEqual(parsed.metadata.size, packet.length)
    assert.deepStrictEqual(parsed.data.params.item.components[0].data.bees[0], {
      entityType: beeId,
      nbtData: { type: 'compound', value: occupant.nbtData.value },
      ticksInHive: 130,
      minTicksInHive: 7
    })
    assert.ok(packet.includes(Buffer.from([79, 1, beeId, 10])), 'component must encode bee entity ID before NBT compound')
    assert.deepStrictEqual(serialize.createPacketBuffer(parsed.data), packet)
  })

  it('round-trips exact and partial component predicate matcher payloads', function () {
    const data = require('minecraft-data')('26.3')
    const emptyCompound = { type: 'compound', name: '', value: {} }
    for (const compiled of [true, false]) {
      const serialize = minecraftProtocol.createSerializer({ state: 'play', isServer: true, version: '26.3', compiled })
      const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3', noErrorLogging: true, compiled })
      const packet = serialize.createPacketBuffer({
        name: 'set_slot',
        params: {
          windowId: 0,
          stateId: 1,
          slot: 0,
          item: {
            itemCount: 1,
            itemId: data.itemsByName.feather.id,
            addedComponentCount: 1,
            removedComponentCount: 0,
            components: [{
              type: 'can_break',
              data: {
                predicates: [
                  {
                    blockSet: { blockIds: [data.blocksByName.stone.id] },
                    properties: [],
                    nbt: undefined,
                    components: {
                      exactMatchers: [
                        { type: 'damage', data: 5 },
                        { type: 'trim', data: { material: { materialId: 0 }, pattern: { patternId: 1 } } }
                      ],
                      partialMatchers: [{ isPredicate: false, type: 'custom_name', data: emptyCompound }]
                    }
                  },
                  {
                    blockSet: { name: 'minecraft:mineable/pickaxe' },
                    properties: [],
                    nbt: undefined,
                    components: { exactMatchers: [], partialMatchers: [] }
                  }
                ]
              }
            }],
            removeComponents: []
          }
        }
      })
      const parsed = deserialize.parsePacketBuffer(packet)
      const component = parsed.data.params.item.components[0]

      assert.strictEqual(parsed.metadata.size, packet.length)
      assert.strictEqual(component.type, 'can_break')
      assert.deepStrictEqual(component.data.predicates[0].components, {
        exactMatchers: [
          { type: 'damage', data: 5 },
          { type: 'trim', data: { material: { materialId: 0 }, pattern: { patternId: 1 } } }
        ],
        partialMatchers: [{ isPredicate: false, type: 'custom_name', data: { type: 'compound', value: {} } }]
      })
      assert.deepStrictEqual(component.data.predicates[1].blockSet, {
        name: 'minecraft:mineable/pickaxe'
      })
      assert.deepStrictEqual(serialize.createPacketBuffer(parsed.data), packet)
      assert.throws(() => deserialize.parsePacketBuffer(packet.subarray(0, packet.length - 4)))
    }
  })

  it('enforces Vanilla 26.3 partial matcher count limit while preserving the 64-entry boundary', function () {
    const data = require('minecraft-data')('26.3')
    const componentTypes = Object.entries(data.protocol.types.SlotComponentType[1].mappings)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, name]) => name)
    const emptyCompound = { type: 'compound', name: '', value: {} }
    const makePacket = partialMatchers => ({
      name: 'set_slot',
      params: {
        windowId: 0,
        stateId: 1,
        slot: 0,
        item: {
          itemCount: 1,
          itemId: data.itemsByName.feather.id,
          addedComponentCount: 1,
          removedComponentCount: 0,
          components: [{
            type: 'can_break',
            data: {
              predicates: [{
                blockSet: { blockIds: [data.blocksByName.stone.id] },
                properties: [],
                nbt: undefined,
                components: {
                  exactMatchers: [],
                  partialMatchers
                }
              }]
            }
          }],
          removeComponents: []
        }
      }
    })

    for (const compiled of [true, false]) {
      const serialize = minecraftProtocol.createSerializer({ state: 'play', isServer: true, version: '26.3', compiled })
      const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3', noErrorLogging: true, compiled })
      const partialMatchers = count => componentTypes.slice(0, count).map(type => ({
        isPredicate: false,
        type,
        data: emptyCompound
      }))

      for (const count of [0, 64]) {
        const packet = serialize.createPacketBuffer(makePacket(partialMatchers(count)))
        const parsed = deserialize.parsePacketBuffer(packet)
        const parsedMatchers = parsed.data.params.item.components[0].data.predicates[0].components.partialMatchers
        assert.strictEqual(parsedMatchers.length, count)
        assert.strictEqual(parsed.metadata.size, packet.length)
        assert.deepStrictEqual(serialize.createPacketBuffer(parsed.data), packet)
      }

      const oversizedPacket = serialize.createPacketBuffer(makePacket([]))
      assert.strictEqual(oversizedPacket[oversizedPacket.length - 1], 0, 'empty partial matcher count is the final packet field')
      oversizedPacket[oversizedPacket.length - 1] = 65
      assert.throws(() => deserialize.parsePacketBuffer(oversizedPacket), /partial component matcher.*64/i)

      const oversizedValue = makePacket(partialMatchers(65))
      assert.throws(() => serialize.proto.sizeOf(oversizedValue, 'packet'), /partial component matcher.*64/i)
      assert.throws(() => serialize.proto.write(oversizedValue, Buffer.alloc(8192), 0, 'packet'), /partial component matcher.*64/i)
    }
  })

  it('round-trips 26.3 complete and partial profiles with boolean skin models', function () {
    const data = require('minecraft-data')('26.3')
    const profiles = [
      {
        type: 'complete',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Alex',
        properties: [{ name: 'textures', value: 'encoded-texture', signature: 'signature' }],
        skinPatch: {
          body: 'minecraft:skins/player',
          cape: 'minecraft:skins/cape',
          elytra: 'minecraft:skins/elytra',
          model: true
        }
      },
      {
        type: 'partial',
        uuid: undefined,
        name: 'Alex',
        properties: [],
        skinPatch: { body: undefined, cape: undefined, elytra: undefined, model: false }
      }
    ]

    for (const compiled of [true, false]) {
      const serialize = minecraftProtocol.createSerializer({ state: 'play', isServer: true, version: '26.3', compiled })
      const deserialize = minecraftProtocol.createDeserializer({ state: 'play', noErrorLogging: true, version: '26.3', compiled })
      for (const profile of profiles) {
        const packet = serialize.createPacketBuffer({
          name: 'set_slot',
          params: {
            windowId: 0,
            stateId: 1,
            slot: 0,
            item: {
              itemCount: 1,
              itemId: data.itemsByName.player_head.id,
              addedComponentCount: 1,
              removedComponentCount: 0,
              components: [{ type: 'profile', data: profile }],
              removeComponents: []
            }
          }
        })
        const parsed = deserialize.parsePacketBuffer(packet)

        assert.strictEqual(parsed.metadata.size, packet.length)
        assert.deepStrictEqual(parsed.data.params.item.components[0].data, profile)
        assert.deepStrictEqual(serialize.createPacketBuffer(parsed.data), packet)
      }
    }
  })
})
