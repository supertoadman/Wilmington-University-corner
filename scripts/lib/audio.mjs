// MP3 duration from the file bytes, so track lists can show lengths without loading audio.
// Reads the Xing/Info or VBRI frame count when there is one (VBR files), and otherwise
// assumes a constant bitrate from the first frame. Returns seconds, or null if no frame is found.

const BITRATES = { // kbps by [MPEG-1, MPEG-2/2.5] for Layer III
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function mp3Duration(buf) {
  let o = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') o = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  for (; o < buf.length - 4; o++) {
    if (buf[o] !== 0xff || (buf[o + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[o + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (buf[o + 1] >> 1) & 3; // 1 = Layer III
    const rate = RATES[version]?.[(buf[o + 2] >> 2) & 3];
    const kbps = BITRATES[version === 3 ? 1 : 2][buf[o + 2] >> 4];
    if (layer !== 1 || !rate || !kbps) continue;
    const mono = (buf[o + 3] >> 6) === 3;
    const samples = version === 3 ? 1152 : 576;
    const side = version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    const xing = o + 4 + side;
    const tag = buf.toString('latin1', xing, xing + 4);
    if ((tag === 'Xing' || tag === 'Info') && buf[xing + 7] & 1) return (buf.readUInt32BE(xing + 8) * samples) / rate;
    if (buf.toString('latin1', o + 36, o + 40) === 'VBRI') return (buf.readUInt32BE(o + 50) * samples) / rate;
    return ((buf.length - o) * 8) / (kbps * 1000);
  }
  return null;
}
