import dgram from 'node:dgram';

/**
 * Wake-on-LAN.
 *
 * A machine that is switched off cannot poll for commands, so this is the
 * one action the server performs itself: a "magic packet" broadcast on the
 * local network, which the network card answers even while the PC is off.
 *
 * It only works if Wake-on-LAN is enabled in the machine's BIOS and network
 * adapter, and only within the same subnet — a broadcast does not cross
 * routers. That is a property of the protocol, not of this code.
 */
export function sendMagicPacket(macAddress, { port = 9, broadcast = '255.255.255.255' } = {}) {
  return new Promise((resolve, reject) => {
    const clean = String(macAddress ?? '').replace(/[^0-9a-f]/gi, '');
    if (clean.length !== 12) {
      return reject(new Error('That MAC address is not valid. Use the form AA:BB:CC:DD:EE:FF.'));
    }

    const mac = Buffer.from(clean, 'hex');

    // The packet is six 0xFF bytes followed by the MAC repeated 16 times.
    const packet = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i += 1) mac.copy(packet, 6 + i * 6);

    const socket = dgram.createSocket('udp4');

    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcast, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve({ sent: true, mac: clean.match(/.{2}/g).join(':').toUpperCase() });
      });
    });
  });
}

export default { sendMagicPacket };
