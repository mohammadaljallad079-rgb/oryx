#!/usr/bin/env python3
"""Compose a light-vs-dark comparison sheet from two equal-size PNGs.

Used by the Execution 08 preview evidence. Reads and writes PNGs with the
standard library only, so it runs in the sandbox without Pillow.
"""
import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    pos, idat = 8, b''
    width = height = None
    colour_type = None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, _depth, colour_type = struct.unpack('>IIBB', chunk[:10])
        elif kind == b'IDAT':
            idat += chunk
        elif kind == b'IEND':
            break
        pos += 12 + length
    raw = zlib.decompress(idat)
    channels = 4 if colour_type == 6 else 3
    stride = width * channels
    pixels = bytearray()
    previous = bytearray(stride)
    i = 0
    for _ in range(height):
        filter_type = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        for x in range(stride):
            a = line[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if filter_type == 1:
                line[x] = (line[x] + a) & 255
            elif filter_type == 2:
                line[x] = (line[x] + b) & 255
            elif filter_type == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif filter_type == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                predictor = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + predictor) & 255
        pixels += line
        previous = line
    return width, height, channels, bytes(pixels)


def write_png(path, width, height, rgb):
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw += rgb[y * stride:(y + 1) * stride]
    def chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload
                + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def to_rgb(width, height, channels, pixels):
    if channels == 3:
        return pixels
    out = bytearray(width * height * 3)
    for i in range(width * height):
        out[i * 3:i * 3 + 3] = pixels[i * 4:i * 4 + 3]
    return bytes(out)


def main(light_path, dark_path, out_path, gap=16, border=0):
    lw, lh, lc, lp = read_png(light_path)
    dw, dh, dc, dp = read_png(dark_path)
    height = min(lh, dh)
    width = min(lw, dw)
    left = to_rgb(width, height, lc, lp)
    right = to_rgb(width, height, dc, dp)
    sheet_w = width * 2 + gap
    sheet = bytearray(b'\xf0\xf0\xf0' * (sheet_w * height))
    for y in range(height):
        row = y * width * 3
        sheet[y * sheet_w * 3:(y * sheet_w + width) * 3] = left[row:row + width * 3]
        dest = (y * sheet_w + width + gap) * 3
        sheet[dest:dest + width * 3] = right[row:row + width * 3]
    write_png(out_path, sheet_w, height, bytes(sheet))
    print(f'{out_path}  {sheet_w}x{height}  (light | dark)')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: make-comparison.py <light.png> <dark.png> <out.png>')
    main(sys.argv[1], sys.argv[2], sys.argv[3])
