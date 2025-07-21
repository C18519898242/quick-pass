/*
 * Copyright (C) 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 JMRtech
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT

 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
class TOTP {
    constructor(secret, period = 30, digits = 6) {
        this.secret = secret;
        this.period = period;
        this.digits = digits;
    }

    generate() {
        const counter = Math.floor(Date.now() / 1000 / this.period);
        return this.hotp(counter);
    }

    hotp(counter) {
        const decodedSecret = this.base32tohex(this.secret);
        const hmac = this.hmacSha1(decodedSecret, this.leftpad(this.dec2hex(counter), 16, '0'));
        const offset = this.hex2dec(hmac.substring(hmac.length - 1));
        let otp = (this.hex2dec(hmac.substr(offset * 2, 8)) & this.hex2dec('7fffffff')) + '';
        otp = otp.substr(otp.length - this.digits, this.digits);
        return otp;
    }

    base32tohex(base32) {
        const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let bits = "";
        let hex = "";
        for (let i = 0; i < base32.length; i++) {
            const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
            bits += this.leftpad(val.toString(2), 5, '0');
        }
        for (let i = 0; i + 4 <= bits.length; i += 4) {
            const chunk = bits.substr(i, 4);
            hex = hex + parseInt(chunk, 2).toString(16);
        }
        return hex;
    }

    dec2hex(s) { return (s < 15.5 ? '0' : '') + Math.round(s).toString(16); }
    hex2dec(s) { return parseInt(s, 16); }

    leftpad(str, len, pad) {
        if (len + 1 >= str.length) {
            str = Array(len + 1 - str.length).join(pad) + str;
        }
        return str;
    }

    hmacSha1(key, message) {
        const keyHex = this.leftpad(key, 128, '0');
        const ipad = this.xor(keyHex, '36363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636');
        const opad = this.xor(keyHex, '5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c');
        const ipadMessage = ipad + message;
        const opadIpadMessage = opad + this.sha1(ipadMessage);
        return this.sha1(opadIpadMessage);
    }

    xor(a, b) {
        let res = '';
        for (let i = 0; i < a.length; i++) {
            res += (parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(16);
        }
        return res;
    }

    sha1(s) {
        const H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
        const K = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6];

        s = this.utf8Encode(s);
        const len = s.length;
        const w = [];

        for (let i = 0; i < len - 3; i += 4) {
            const j = s.charCodeAt(i) << 24 | s.charCodeAt(i + 1) << 16 | s.charCodeAt(i + 2) << 8 | s.charCodeAt(i + 3);
            w.push(j);
        }

        switch (len % 4) {
            case 0: w.push(0x080000000); break;
            case 1: w.push(s.charCodeAt(len - 1) << 24 | 0x0800000); break;
            case 2: w.push(s.charCodeAt(len - 2) << 24 | s.charCodeAt(len - 1) << 16 | 0x08000); break;
            case 3: w.push(s.charCodeAt(len - 3) << 24 | s.charCodeAt(len - 2) << 16 | s.charCodeAt(len - 1) << 8 | 0x80); break;
        }

        while ((w.length % 16) != 14) w.push(0);
        w.push(len >>> 29);
        w.push((len << 3) & 0x0ffffffff);

        for (let chunk = 0; chunk < w.length; chunk += 16) {
            const w_chunk = w.slice(chunk, chunk + 16);
            const H_chunk = H.slice(0);

            for (let i = 0; i < 80; i++) {
                const s = Math.floor(i / 20);
                const f = (s == 0) ? (H_chunk[1] & H_chunk[2]) ^ (~H_chunk[1] & H_chunk[3]) :
                          (s == 1) ? H_chunk[1] ^ H_chunk[2] ^ H_chunk[3] :
                          (s == 2) ? (H_chunk[1] & H_chunk[2]) ^ (H_chunk[1] & H_chunk[3]) ^ (H_chunk[2] & H_chunk[3]) :
                          H_chunk[1] ^ H_chunk[2] ^ H_chunk[3];

                const temp = (this.rol(H_chunk[0], 5) + f + H_chunk[4] + w_chunk[i] + K[s]) & 0x0ffffffff;
                H_chunk[4] = H_chunk[3];
                H_chunk[3] = H_chunk[2];
                H_chunk[2] = this.rol(H_chunk[1], 30);
                H_chunk[1] = H_chunk[0];
                H_chunk[0] = temp;
            }

            for (let i = 0; i < 5; i++) H[i] = (H[i] + H_chunk[i]) & 0x0ffffffff;
        }

        let result = '';
        for (let i = 0; i < 5; i++) {
            result += this.leftpad(H[i].toString(16), 8, '0');
        }
        return result;
    }

    rol(num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    utf8Encode(str) {
        let utftext = "";
        for (let n = 0; n < str.length; n++) {
            let c = str.charCodeAt(n);
            if (c < 128) {
                utftext += String.fromCharCode(c);
            } else if ((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            } else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }
        }
        return utftext;
    }
}
