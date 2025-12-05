import { app, ipcMain, dialog, BrowserWindow } from "electron";
import path, { parse as parse$2, dirname } from "path";
import fs from "fs";
import https from "https";
import * as realZlib from "zlib";
import realZlib__default from "zlib";
import require$$0 from "crypto";
import EE, { EventEmitter as EventEmitter$1 } from "events";
import { EventEmitter } from "node:events";
import Stream from "node:stream";
import { StringDecoder } from "node:string_decoder";
import path$1, { posix, basename, win32, join } from "node:path";
import fs$1 from "node:fs";
import assert from "assert";
import require$$0$2, { Buffer as Buffer$1 } from "buffer";
import assert$1 from "node:assert";
import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import { fileURLToPath } from "url";
import require$$2, { spawn } from "child_process";
import require$$0$1 from "os";
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var util = { exports: {} };
var constants$1;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants$1;
  hasRequiredConstants = 1;
  constants$1 = {
    /* The local file header */
    LOCHDR: 30,
    // LOC header size
    LOCSIG: 67324752,
    // "PK\003\004"
    LOCVER: 4,
    // version needed to extract
    LOCFLG: 6,
    // general purpose bit flag
    LOCHOW: 8,
    // compression method
    LOCTIM: 10,
    // modification time (2 bytes time, 2 bytes date)
    LOCCRC: 14,
    // uncompressed file crc-32 value
    LOCSIZ: 18,
    // compressed size
    LOCLEN: 22,
    // uncompressed size
    LOCNAM: 26,
    // filename length
    LOCEXT: 28,
    // extra field length
    /* The Data descriptor */
    EXTSIG: 134695760,
    // "PK\007\008"
    EXTHDR: 16,
    // EXT header size
    EXTCRC: 4,
    // uncompressed file crc-32 value
    EXTSIZ: 8,
    // compressed size
    EXTLEN: 12,
    // uncompressed size
    /* The central directory file header */
    CENHDR: 46,
    // CEN header size
    CENSIG: 33639248,
    // "PK\001\002"
    CENVEM: 4,
    // version made by
    CENVER: 6,
    // version needed to extract
    CENFLG: 8,
    // encrypt, decrypt flags
    CENHOW: 10,
    // compression method
    CENTIM: 12,
    // modification time (2 bytes time, 2 bytes date)
    CENCRC: 16,
    // uncompressed file crc-32 value
    CENSIZ: 20,
    // compressed size
    CENLEN: 24,
    // uncompressed size
    CENNAM: 28,
    // filename length
    CENEXT: 30,
    // extra field length
    CENCOM: 32,
    // file comment length
    CENDSK: 34,
    // volume number start
    CENATT: 36,
    // internal file attributes
    CENATX: 38,
    // external file attributes (host system dependent)
    CENOFF: 42,
    // LOC header offset
    /* The entries in the end of central directory */
    ENDHDR: 22,
    // END header size
    ENDSIG: 101010256,
    // "PK\005\006"
    ENDSUB: 8,
    // number of entries on this disk
    ENDTOT: 10,
    // total number of entries
    ENDSIZ: 12,
    // central directory size in bytes
    ENDOFF: 16,
    // offset of first CEN header
    ENDCOM: 20,
    // zip file comment length
    END64HDR: 20,
    // zip64 END header size
    END64SIG: 117853008,
    // zip64 Locator signature, "PK\006\007"
    END64START: 4,
    // number of the disk with the start of the zip64
    END64OFF: 8,
    // relative offset of the zip64 end of central directory
    END64NUMDISKS: 16,
    // total number of disks
    ZIP64SIG: 101075792,
    // zip64 signature, "PK\006\006"
    ZIP64HDR: 56,
    // zip64 record minimum size
    ZIP64LEAD: 12,
    // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
    ZIP64SIZE: 4,
    // zip64 size of the central directory record
    ZIP64VEM: 12,
    // zip64 version made by
    ZIP64VER: 14,
    // zip64 version needed to extract
    ZIP64DSK: 16,
    // zip64 number of this disk
    ZIP64DSKDIR: 20,
    // number of the disk with the start of the record directory
    ZIP64SUB: 24,
    // number of entries on this disk
    ZIP64TOT: 32,
    // total number of entries
    ZIP64SIZB: 40,
    // zip64 central directory size in bytes
    ZIP64OFF: 48,
    // offset of start of central directory with respect to the starting disk number
    ZIP64EXTRA: 56,
    // extensible data sector
    /* Compression methods */
    STORED: 0,
    // no compression
    SHRUNK: 1,
    // shrunk
    REDUCED1: 2,
    // reduced with compression factor 1
    REDUCED2: 3,
    // reduced with compression factor 2
    REDUCED3: 4,
    // reduced with compression factor 3
    REDUCED4: 5,
    // reduced with compression factor 4
    IMPLODED: 6,
    // imploded
    // 7 reserved for Tokenizing compression algorithm
    DEFLATED: 8,
    // deflated
    ENHANCED_DEFLATED: 9,
    // enhanced deflated
    PKWARE: 10,
    // PKWare DCL imploded
    // 11 reserved by PKWARE
    BZIP2: 12,
    //  compressed using BZIP2
    // 13 reserved by PKWARE
    LZMA: 14,
    // LZMA
    // 15-17 reserved by PKWARE
    IBM_TERSE: 18,
    // compressed using IBM TERSE
    IBM_LZ77: 19,
    // IBM LZ77 z
    AES_ENCRYPT: 99,
    // WinZIP AES encryption method
    /* General purpose bit flag */
    // values can obtained with expression 2**bitnr
    FLG_ENC: 1,
    // Bit 0: encrypted file
    FLG_COMP1: 2,
    // Bit 1, compression option
    FLG_COMP2: 4,
    // Bit 2, compression option
    FLG_DESC: 8,
    // Bit 3, data descriptor
    FLG_ENH: 16,
    // Bit 4, enhanced deflating
    FLG_PATCH: 32,
    // Bit 5, indicates that the file is compressed patched data.
    FLG_STR: 64,
    // Bit 6, strong encryption (patented)
    // Bits 7-10: Currently unused.
    FLG_EFS: 2048,
    // Bit 11: Language encoding flag (EFS)
    // Bit 12: Reserved by PKWARE for enhanced compression.
    // Bit 13: encrypted the Central Directory (patented).
    // Bits 14-15: Reserved by PKWARE.
    FLG_MSK: 4096,
    // mask header values
    /* Load type */
    FILE: 2,
    BUFFER: 1,
    NONE: 0,
    /* 4.5 Extensible data fields */
    EF_ID: 0,
    EF_SIZE: 2,
    /* Header IDs */
    ID_ZIP64: 1,
    ID_AVINFO: 7,
    ID_PFS: 8,
    ID_OS2: 9,
    ID_NTFS: 10,
    ID_OPENVMS: 12,
    ID_UNIX: 13,
    ID_FORK: 14,
    ID_PATCH: 15,
    ID_X509_PKCS7: 20,
    ID_X509_CERTID_F: 21,
    ID_X509_CERTID_C: 22,
    ID_STRONGENC: 23,
    ID_RECORD_MGT: 24,
    ID_X509_PKCS7_RL: 25,
    ID_IBM1: 101,
    ID_IBM2: 102,
    ID_POSZIP: 18064,
    EF_ZIP64_OR_32: 4294967295,
    EF_ZIP64_OR_16: 65535,
    EF_ZIP64_SUNCOMP: 0,
    EF_ZIP64_SCOMP: 8,
    EF_ZIP64_RHO: 16,
    EF_ZIP64_DSN: 24
  };
  return constants$1;
}
var errors = {};
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  (function(exports$1) {
    const errors2 = {
      /* Header error messages */
      INVALID_LOC: "Invalid LOC header (bad signature)",
      INVALID_CEN: "Invalid CEN header (bad signature)",
      INVALID_END: "Invalid END header (bad signature)",
      /* Descriptor */
      DESCRIPTOR_NOT_EXIST: "No descriptor present",
      DESCRIPTOR_UNKNOWN: "Unknown descriptor format",
      DESCRIPTOR_FAULTY: "Descriptor data is malformed",
      /* ZipEntry error messages*/
      NO_DATA: "Nothing to decompress",
      BAD_CRC: "CRC32 checksum failed {0}",
      FILE_IN_THE_WAY: "There is a file in the way: {0}",
      UNKNOWN_METHOD: "Invalid/unsupported compression method",
      /* Inflater error messages */
      AVAIL_DATA: "inflate::Available inflate data did not terminate",
      INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
      TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
      INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
      INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
      INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
      INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
      INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
      INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
      INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",
      /* ADM-ZIP error messages */
      CANT_EXTRACT_FILE: "Could not extract the file",
      CANT_OVERRIDE: "Target file already exists",
      DISK_ENTRY_TOO_LARGE: "Number of disk entries is too large",
      NO_ZIP: "No zip file was loaded",
      NO_ENTRY: "Entry doesn't exist",
      DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
      FILE_NOT_FOUND: 'File not found: "{0}"',
      NOT_IMPLEMENTED: "Not implemented",
      INVALID_FILENAME: "Invalid filename",
      INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",
      INVALID_PASS_PARAM: "Incompatible password parameter",
      WRONG_PASSWORD: "Wrong Password",
      /* ADM-ZIP */
      COMMENT_TOO_LONG: "Comment is too long",
      // Comment can be max 65535 bytes long (NOTE: some non-US characters may take more space)
      EXTRA_FIELD_PARSE_ERROR: "Extra field parsing error"
    };
    function E(message) {
      return function(...args) {
        if (args.length) {
          message = message.replace(/\{(\d)\}/g, (_, n) => args[n] || "");
        }
        return new Error("ADM-ZIP: " + message);
      };
    }
    for (const msg of Object.keys(errors2)) {
      exports$1[msg] = E(errors2[msg]);
    }
  })(errors);
  return errors;
}
var utils;
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  const fsystem = fs;
  const pth = path;
  const Constants = requireConstants();
  const Errors = requireErrors();
  const isWin = typeof process === "object" && "win32" === process.platform;
  const is_Obj = (obj) => typeof obj === "object" && obj !== null;
  const crcTable = new Uint32Array(256).map((t, c) => {
    for (let k = 0; k < 8; k++) {
      if ((c & 1) !== 0) {
        c = 3988292384 ^ c >>> 1;
      } else {
        c >>>= 1;
      }
    }
    return c >>> 0;
  });
  function Utils(opts) {
    this.sep = pth.sep;
    this.fs = fsystem;
    if (is_Obj(opts)) {
      if (is_Obj(opts.fs) && typeof opts.fs.statSync === "function") {
        this.fs = opts.fs;
      }
    }
  }
  utils = Utils;
  Utils.prototype.makeDir = function(folder) {
    const self = this;
    function mkdirSync2(fpath) {
      let resolvedPath = fpath.split(self.sep)[0];
      fpath.split(self.sep).forEach(function(name2) {
        if (!name2 || name2.substr(-1, 1) === ":") return;
        resolvedPath += self.sep + name2;
        var stat;
        try {
          stat = self.fs.statSync(resolvedPath);
        } catch (e) {
          self.fs.mkdirSync(resolvedPath);
        }
        if (stat && stat.isFile()) throw Errors.FILE_IN_THE_WAY(`"${resolvedPath}"`);
      });
    }
    mkdirSync2(folder);
  };
  Utils.prototype.writeFileTo = function(path2, content, overwrite, attr) {
    const self = this;
    if (self.fs.existsSync(path2)) {
      if (!overwrite) return false;
      var stat = self.fs.statSync(path2);
      if (stat.isDirectory()) {
        return false;
      }
    }
    var folder = pth.dirname(path2);
    if (!self.fs.existsSync(folder)) {
      self.makeDir(folder);
    }
    var fd;
    try {
      fd = self.fs.openSync(path2, "w", 438);
    } catch (e) {
      self.fs.chmodSync(path2, 438);
      fd = self.fs.openSync(path2, "w", 438);
    }
    if (fd) {
      try {
        self.fs.writeSync(fd, content, 0, content.length, 0);
      } finally {
        self.fs.closeSync(fd);
      }
    }
    self.fs.chmodSync(path2, attr || 438);
    return true;
  };
  Utils.prototype.writeFileToAsync = function(path2, content, overwrite, attr, callback) {
    if (typeof attr === "function") {
      callback = attr;
      attr = void 0;
    }
    const self = this;
    self.fs.exists(path2, function(exist) {
      if (exist && !overwrite) return callback(false);
      self.fs.stat(path2, function(err, stat) {
        if (exist && stat.isDirectory()) {
          return callback(false);
        }
        var folder = pth.dirname(path2);
        self.fs.exists(folder, function(exists) {
          if (!exists) self.makeDir(folder);
          self.fs.open(path2, "w", 438, function(err2, fd) {
            if (err2) {
              self.fs.chmod(path2, 438, function() {
                self.fs.open(path2, "w", 438, function(err3, fd2) {
                  self.fs.write(fd2, content, 0, content.length, 0, function() {
                    self.fs.close(fd2, function() {
                      self.fs.chmod(path2, attr || 438, function() {
                        callback(true);
                      });
                    });
                  });
                });
              });
            } else if (fd) {
              self.fs.write(fd, content, 0, content.length, 0, function() {
                self.fs.close(fd, function() {
                  self.fs.chmod(path2, attr || 438, function() {
                    callback(true);
                  });
                });
              });
            } else {
              self.fs.chmod(path2, attr || 438, function() {
                callback(true);
              });
            }
          });
        });
      });
    });
  };
  Utils.prototype.findFiles = function(path2) {
    const self = this;
    function findSync(dir, pattern, recursive) {
      let files = [];
      self.fs.readdirSync(dir).forEach(function(file) {
        const path3 = pth.join(dir, file);
        const stat = self.fs.statSync(path3);
        {
          files.push(pth.normalize(path3) + (stat.isDirectory() ? self.sep : ""));
        }
        if (stat.isDirectory() && recursive) files = files.concat(findSync(path3, pattern, recursive));
      });
      return files;
    }
    return findSync(path2, void 0, true);
  };
  Utils.prototype.findFilesAsync = function(dir, cb) {
    const self = this;
    let results = [];
    self.fs.readdir(dir, function(err, list2) {
      if (err) return cb(err);
      let list_length = list2.length;
      if (!list_length) return cb(null, results);
      list2.forEach(function(file) {
        file = pth.join(dir, file);
        self.fs.stat(file, function(err2, stat) {
          if (err2) return cb(err2);
          if (stat) {
            results.push(pth.normalize(file) + (stat.isDirectory() ? self.sep : ""));
            if (stat.isDirectory()) {
              self.findFilesAsync(file, function(err3, res) {
                if (err3) return cb(err3);
                results = results.concat(res);
                if (!--list_length) cb(null, results);
              });
            } else {
              if (!--list_length) cb(null, results);
            }
          }
        });
      });
    });
  };
  Utils.prototype.getAttributes = function() {
  };
  Utils.prototype.setAttributes = function() {
  };
  Utils.crc32update = function(crc, byte) {
    return crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  };
  Utils.crc32 = function(buf) {
    if (typeof buf === "string") {
      buf = Buffer.from(buf, "utf8");
    }
    let len = buf.length;
    let crc = -1;
    for (let off = 0; off < len; ) crc = Utils.crc32update(crc, buf[off++]);
    return ~crc >>> 0;
  };
  Utils.methodToString = function(method) {
    switch (method) {
      case Constants.STORED:
        return "STORED (" + method + ")";
      case Constants.DEFLATED:
        return "DEFLATED (" + method + ")";
      default:
        return "UNSUPPORTED (" + method + ")";
    }
  };
  Utils.canonical = function(path2) {
    if (!path2) return "";
    const safeSuffix = pth.posix.normalize("/" + path2.split("\\").join("/"));
    return pth.join(".", safeSuffix);
  };
  Utils.zipnamefix = function(path2) {
    if (!path2) return "";
    const safeSuffix = pth.posix.normalize("/" + path2.split("\\").join("/"));
    return pth.posix.join(".", safeSuffix);
  };
  Utils.findLast = function(arr, callback) {
    if (!Array.isArray(arr)) throw new TypeError("arr is not array");
    const len = arr.length >>> 0;
    for (let i = len - 1; i >= 0; i--) {
      if (callback(arr[i], i, arr)) {
        return arr[i];
      }
    }
    return void 0;
  };
  Utils.sanitize = function(prefix, name2) {
    prefix = pth.resolve(pth.normalize(prefix));
    var parts = name2.split("/");
    for (var i = 0, l = parts.length; i < l; i++) {
      var path2 = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
      if (path2.indexOf(prefix) === 0) {
        return path2;
      }
    }
    return pth.normalize(pth.join(prefix, pth.basename(name2)));
  };
  Utils.toBuffer = function toBuffer(input, encoder) {
    if (Buffer.isBuffer(input)) {
      return input;
    } else if (input instanceof Uint8Array) {
      return Buffer.from(input);
    } else {
      return typeof input === "string" ? encoder(input) : Buffer.alloc(0);
    }
  };
  Utils.readBigUInt64LE = function(buffer, index) {
    var slice = Buffer.from(buffer.slice(index, index + 8));
    slice.swap64();
    return parseInt(`0x${slice.toString("hex")}`);
  };
  Utils.fromDOS2Date = function(val) {
    return new Date((val >> 25 & 127) + 1980, Math.max((val >> 21 & 15) - 1, 0), Math.max(val >> 16 & 31, 1), val >> 11 & 31, val >> 5 & 63, (val & 31) << 1);
  };
  Utils.fromDate2DOS = function(val) {
    let date = 0;
    let time = 0;
    if (val.getFullYear() > 1979) {
      date = (val.getFullYear() - 1980 & 127) << 9 | val.getMonth() + 1 << 5 | val.getDate();
      time = val.getHours() << 11 | val.getMinutes() << 5 | val.getSeconds() >> 1;
    }
    return date << 16 | time;
  };
  Utils.isWin = isWin;
  Utils.crcTable = crcTable;
  return utils;
}
var fattr;
var hasRequiredFattr;
function requireFattr() {
  if (hasRequiredFattr) return fattr;
  hasRequiredFattr = 1;
  const pth = path;
  fattr = function(path2, { fs: fs2 }) {
    var _path2 = path2 || "", _obj = newAttr(), _stat = null;
    function newAttr() {
      return {
        directory: false,
        readonly: false,
        hidden: false,
        executable: false,
        mtime: 0,
        atime: 0
      };
    }
    if (_path2 && fs2.existsSync(_path2)) {
      _stat = fs2.statSync(_path2);
      _obj.directory = _stat.isDirectory();
      _obj.mtime = _stat.mtime;
      _obj.atime = _stat.atime;
      _obj.executable = (73 & _stat.mode) !== 0;
      _obj.readonly = (128 & _stat.mode) === 0;
      _obj.hidden = pth.basename(_path2)[0] === ".";
    } else {
      console.warn("Invalid path: " + _path2);
    }
    return {
      get directory() {
        return _obj.directory;
      },
      get readOnly() {
        return _obj.readonly;
      },
      get hidden() {
        return _obj.hidden;
      },
      get mtime() {
        return _obj.mtime;
      },
      get atime() {
        return _obj.atime;
      },
      get executable() {
        return _obj.executable;
      },
      decodeAttributes: function() {
      },
      encodeAttributes: function() {
      },
      toJSON: function() {
        return {
          path: _path2,
          isDirectory: _obj.directory,
          isReadOnly: _obj.readonly,
          isHidden: _obj.hidden,
          isExecutable: _obj.executable,
          mTime: _obj.mtime,
          aTime: _obj.atime
        };
      },
      toString: function() {
        return JSON.stringify(this.toJSON(), null, "	");
      }
    };
  };
  return fattr;
}
var decoder;
var hasRequiredDecoder;
function requireDecoder() {
  if (hasRequiredDecoder) return decoder;
  hasRequiredDecoder = 1;
  decoder = {
    efs: true,
    encode: (data) => Buffer.from(data, "utf8"),
    decode: (data) => data.toString("utf8")
  };
  return decoder;
}
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util.exports;
  hasRequiredUtil = 1;
  util.exports = requireUtils();
  util.exports.Constants = requireConstants();
  util.exports.Errors = requireErrors();
  util.exports.FileAttr = requireFattr();
  util.exports.decoder = requireDecoder();
  return util.exports;
}
var headers = {};
var entryHeader;
var hasRequiredEntryHeader;
function requireEntryHeader() {
  if (hasRequiredEntryHeader) return entryHeader;
  hasRequiredEntryHeader = 1;
  var Utils = requireUtil(), Constants = Utils.Constants;
  entryHeader = function() {
    var _verMade = 20, _version = 10, _flags2 = 0, _method = 0, _time = 0, _crc = 0, _compressedSize = 0, _size2 = 0, _fnameLen = 0, _extraLen = 0, _comLen = 0, _diskStart = 0, _inattr = 0, _attr = 0, _offset = 0;
    _verMade |= Utils.isWin ? 2560 : 768;
    _flags2 |= Constants.FLG_EFS;
    const _localHeader = {
      extraLen: 0
    };
    const uint322 = (val) => Math.max(0, val) >>> 0;
    const uint8 = (val) => Math.max(0, val) & 255;
    _time = Utils.fromDate2DOS(/* @__PURE__ */ new Date());
    return {
      get made() {
        return _verMade;
      },
      set made(val) {
        _verMade = val;
      },
      get version() {
        return _version;
      },
      set version(val) {
        _version = val;
      },
      get flags() {
        return _flags2;
      },
      set flags(val) {
        _flags2 = val;
      },
      get flags_efs() {
        return (_flags2 & Constants.FLG_EFS) > 0;
      },
      set flags_efs(val) {
        if (val) {
          _flags2 |= Constants.FLG_EFS;
        } else {
          _flags2 &= ~Constants.FLG_EFS;
        }
      },
      get flags_desc() {
        return (_flags2 & Constants.FLG_DESC) > 0;
      },
      set flags_desc(val) {
        if (val) {
          _flags2 |= Constants.FLG_DESC;
        } else {
          _flags2 &= ~Constants.FLG_DESC;
        }
      },
      get method() {
        return _method;
      },
      set method(val) {
        switch (val) {
          case Constants.STORED:
            this.version = 10;
          case Constants.DEFLATED:
          default:
            this.version = 20;
        }
        _method = val;
      },
      get time() {
        return Utils.fromDOS2Date(this.timeval);
      },
      set time(val) {
        this.timeval = Utils.fromDate2DOS(val);
      },
      get timeval() {
        return _time;
      },
      set timeval(val) {
        _time = uint322(val);
      },
      get timeHighByte() {
        return uint8(_time >>> 8);
      },
      get crc() {
        return _crc;
      },
      set crc(val) {
        _crc = uint322(val);
      },
      get compressedSize() {
        return _compressedSize;
      },
      set compressedSize(val) {
        _compressedSize = uint322(val);
      },
      get size() {
        return _size2;
      },
      set size(val) {
        _size2 = uint322(val);
      },
      get fileNameLength() {
        return _fnameLen;
      },
      set fileNameLength(val) {
        _fnameLen = val;
      },
      get extraLength() {
        return _extraLen;
      },
      set extraLength(val) {
        _extraLen = val;
      },
      get extraLocalLength() {
        return _localHeader.extraLen;
      },
      set extraLocalLength(val) {
        _localHeader.extraLen = val;
      },
      get commentLength() {
        return _comLen;
      },
      set commentLength(val) {
        _comLen = val;
      },
      get diskNumStart() {
        return _diskStart;
      },
      set diskNumStart(val) {
        _diskStart = uint322(val);
      },
      get inAttr() {
        return _inattr;
      },
      set inAttr(val) {
        _inattr = uint322(val);
      },
      get attr() {
        return _attr;
      },
      set attr(val) {
        _attr = uint322(val);
      },
      // get Unix file permissions
      get fileAttr() {
        return (_attr || 0) >> 16 & 4095;
      },
      get offset() {
        return _offset;
      },
      set offset(val) {
        _offset = uint322(val);
      },
      get encrypted() {
        return (_flags2 & Constants.FLG_ENC) === Constants.FLG_ENC;
      },
      get centralHeaderSize() {
        return Constants.CENHDR + _fnameLen + _extraLen + _comLen;
      },
      get realDataOffset() {
        return _offset + Constants.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
      },
      get localHeader() {
        return _localHeader;
      },
      loadLocalHeaderFromBinary: function(input) {
        var data = input.slice(_offset, _offset + Constants.LOCHDR);
        if (data.readUInt32LE(0) !== Constants.LOCSIG) {
          throw Utils.Errors.INVALID_LOC();
        }
        _localHeader.version = data.readUInt16LE(Constants.LOCVER);
        _localHeader.flags = data.readUInt16LE(Constants.LOCFLG);
        _localHeader.method = data.readUInt16LE(Constants.LOCHOW);
        _localHeader.time = data.readUInt32LE(Constants.LOCTIM);
        _localHeader.crc = data.readUInt32LE(Constants.LOCCRC);
        _localHeader.compressedSize = data.readUInt32LE(Constants.LOCSIZ);
        _localHeader.size = data.readUInt32LE(Constants.LOCLEN);
        _localHeader.fnameLen = data.readUInt16LE(Constants.LOCNAM);
        _localHeader.extraLen = data.readUInt16LE(Constants.LOCEXT);
        const extraStart = _offset + Constants.LOCHDR + _localHeader.fnameLen;
        const extraEnd = extraStart + _localHeader.extraLen;
        return input.slice(extraStart, extraEnd);
      },
      loadFromBinary: function(data) {
        if (data.length !== Constants.CENHDR || data.readUInt32LE(0) !== Constants.CENSIG) {
          throw Utils.Errors.INVALID_CEN();
        }
        _verMade = data.readUInt16LE(Constants.CENVEM);
        _version = data.readUInt16LE(Constants.CENVER);
        _flags2 = data.readUInt16LE(Constants.CENFLG);
        _method = data.readUInt16LE(Constants.CENHOW);
        _time = data.readUInt32LE(Constants.CENTIM);
        _crc = data.readUInt32LE(Constants.CENCRC);
        _compressedSize = data.readUInt32LE(Constants.CENSIZ);
        _size2 = data.readUInt32LE(Constants.CENLEN);
        _fnameLen = data.readUInt16LE(Constants.CENNAM);
        _extraLen = data.readUInt16LE(Constants.CENEXT);
        _comLen = data.readUInt16LE(Constants.CENCOM);
        _diskStart = data.readUInt16LE(Constants.CENDSK);
        _inattr = data.readUInt16LE(Constants.CENATT);
        _attr = data.readUInt32LE(Constants.CENATX);
        _offset = data.readUInt32LE(Constants.CENOFF);
      },
      localHeaderToBinary: function() {
        var data = Buffer.alloc(Constants.LOCHDR);
        data.writeUInt32LE(Constants.LOCSIG, 0);
        data.writeUInt16LE(_version, Constants.LOCVER);
        data.writeUInt16LE(_flags2, Constants.LOCFLG);
        data.writeUInt16LE(_method, Constants.LOCHOW);
        data.writeUInt32LE(_time, Constants.LOCTIM);
        data.writeUInt32LE(_crc, Constants.LOCCRC);
        data.writeUInt32LE(_compressedSize, Constants.LOCSIZ);
        data.writeUInt32LE(_size2, Constants.LOCLEN);
        data.writeUInt16LE(_fnameLen, Constants.LOCNAM);
        data.writeUInt16LE(_localHeader.extraLen, Constants.LOCEXT);
        return data;
      },
      centralHeaderToBinary: function() {
        var data = Buffer.alloc(Constants.CENHDR + _fnameLen + _extraLen + _comLen);
        data.writeUInt32LE(Constants.CENSIG, 0);
        data.writeUInt16LE(_verMade, Constants.CENVEM);
        data.writeUInt16LE(_version, Constants.CENVER);
        data.writeUInt16LE(_flags2, Constants.CENFLG);
        data.writeUInt16LE(_method, Constants.CENHOW);
        data.writeUInt32LE(_time, Constants.CENTIM);
        data.writeUInt32LE(_crc, Constants.CENCRC);
        data.writeUInt32LE(_compressedSize, Constants.CENSIZ);
        data.writeUInt32LE(_size2, Constants.CENLEN);
        data.writeUInt16LE(_fnameLen, Constants.CENNAM);
        data.writeUInt16LE(_extraLen, Constants.CENEXT);
        data.writeUInt16LE(_comLen, Constants.CENCOM);
        data.writeUInt16LE(_diskStart, Constants.CENDSK);
        data.writeUInt16LE(_inattr, Constants.CENATT);
        data.writeUInt32LE(_attr, Constants.CENATX);
        data.writeUInt32LE(_offset, Constants.CENOFF);
        return data;
      },
      toJSON: function() {
        const bytes = function(nr) {
          return nr + " bytes";
        };
        return {
          made: _verMade,
          version: _version,
          flags: _flags2,
          method: Utils.methodToString(_method),
          time: this.time,
          crc: "0x" + _crc.toString(16).toUpperCase(),
          compressedSize: bytes(_compressedSize),
          size: bytes(_size2),
          fileNameLength: bytes(_fnameLen),
          extraLength: bytes(_extraLen),
          commentLength: bytes(_comLen),
          diskNumStart: _diskStart,
          inAttr: _inattr,
          attr: _attr,
          offset: _offset,
          centralHeaderSize: bytes(Constants.CENHDR + _fnameLen + _extraLen + _comLen)
        };
      },
      toString: function() {
        return JSON.stringify(this.toJSON(), null, "	");
      }
    };
  };
  return entryHeader;
}
var mainHeader;
var hasRequiredMainHeader;
function requireMainHeader() {
  if (hasRequiredMainHeader) return mainHeader;
  hasRequiredMainHeader = 1;
  var Utils = requireUtil(), Constants = Utils.Constants;
  mainHeader = function() {
    var _volumeEntries = 0, _totalEntries = 0, _size2 = 0, _offset = 0, _commentLength = 0;
    return {
      get diskEntries() {
        return _volumeEntries;
      },
      set diskEntries(val) {
        _volumeEntries = _totalEntries = val;
      },
      get totalEntries() {
        return _totalEntries;
      },
      set totalEntries(val) {
        _totalEntries = _volumeEntries = val;
      },
      get size() {
        return _size2;
      },
      set size(val) {
        _size2 = val;
      },
      get offset() {
        return _offset;
      },
      set offset(val) {
        _offset = val;
      },
      get commentLength() {
        return _commentLength;
      },
      set commentLength(val) {
        _commentLength = val;
      },
      get mainHeaderSize() {
        return Constants.ENDHDR + _commentLength;
      },
      loadFromBinary: function(data) {
        if ((data.length !== Constants.ENDHDR || data.readUInt32LE(0) !== Constants.ENDSIG) && (data.length < Constants.ZIP64HDR || data.readUInt32LE(0) !== Constants.ZIP64SIG)) {
          throw Utils.Errors.INVALID_END();
        }
        if (data.readUInt32LE(0) === Constants.ENDSIG) {
          _volumeEntries = data.readUInt16LE(Constants.ENDSUB);
          _totalEntries = data.readUInt16LE(Constants.ENDTOT);
          _size2 = data.readUInt32LE(Constants.ENDSIZ);
          _offset = data.readUInt32LE(Constants.ENDOFF);
          _commentLength = data.readUInt16LE(Constants.ENDCOM);
        } else {
          _volumeEntries = Utils.readBigUInt64LE(data, Constants.ZIP64SUB);
          _totalEntries = Utils.readBigUInt64LE(data, Constants.ZIP64TOT);
          _size2 = Utils.readBigUInt64LE(data, Constants.ZIP64SIZE);
          _offset = Utils.readBigUInt64LE(data, Constants.ZIP64OFF);
          _commentLength = 0;
        }
      },
      toBinary: function() {
        var b = Buffer.alloc(Constants.ENDHDR + _commentLength);
        b.writeUInt32LE(Constants.ENDSIG, 0);
        b.writeUInt32LE(0, 4);
        b.writeUInt16LE(_volumeEntries, Constants.ENDSUB);
        b.writeUInt16LE(_totalEntries, Constants.ENDTOT);
        b.writeUInt32LE(_size2, Constants.ENDSIZ);
        b.writeUInt32LE(_offset, Constants.ENDOFF);
        b.writeUInt16LE(_commentLength, Constants.ENDCOM);
        b.fill(" ", Constants.ENDHDR);
        return b;
      },
      toJSON: function() {
        const offset = function(nr, len) {
          let offs = nr.toString(16).toUpperCase();
          while (offs.length < len) offs = "0" + offs;
          return "0x" + offs;
        };
        return {
          diskEntries: _volumeEntries,
          totalEntries: _totalEntries,
          size: _size2 + " bytes",
          offset: offset(_offset, 4),
          commentLength: _commentLength
        };
      },
      toString: function() {
        return JSON.stringify(this.toJSON(), null, "	");
      }
    };
  };
  return mainHeader;
}
var hasRequiredHeaders;
function requireHeaders() {
  if (hasRequiredHeaders) return headers;
  hasRequiredHeaders = 1;
  headers.EntryHeader = requireEntryHeader();
  headers.MainHeader = requireMainHeader();
  return headers;
}
var methods = {};
var deflater;
var hasRequiredDeflater;
function requireDeflater() {
  if (hasRequiredDeflater) return deflater;
  hasRequiredDeflater = 1;
  deflater = function(inbuf) {
    var zlib = realZlib__default;
    var opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };
    return {
      deflate: function() {
        return zlib.deflateRawSync(inbuf, opts);
      },
      deflateAsync: function(callback) {
        var tmp = zlib.createDeflateRaw(opts), parts = [], total = 0;
        tmp.on("data", function(data) {
          parts.push(data);
          total += data.length;
        });
        tmp.on("end", function() {
          var buf = Buffer.alloc(total), written = 0;
          buf.fill(0);
          for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            part.copy(buf, written);
            written += part.length;
          }
          callback && callback(buf);
        });
        tmp.end(inbuf);
      }
    };
  };
  return deflater;
}
var inflater;
var hasRequiredInflater;
function requireInflater() {
  if (hasRequiredInflater) return inflater;
  hasRequiredInflater = 1;
  const version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
  inflater = function(inbuf, expectedLength) {
    var zlib = realZlib__default;
    const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};
    return {
      inflate: function() {
        return zlib.inflateRawSync(inbuf, option);
      },
      inflateAsync: function(callback) {
        var tmp = zlib.createInflateRaw(option), parts = [], total = 0;
        tmp.on("data", function(data) {
          parts.push(data);
          total += data.length;
        });
        tmp.on("end", function() {
          var buf = Buffer.alloc(total), written = 0;
          buf.fill(0);
          for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            part.copy(buf, written);
            written += part.length;
          }
          callback && callback(buf);
        });
        tmp.end(inbuf);
      }
    };
  };
  return inflater;
}
var zipcrypto;
var hasRequiredZipcrypto;
function requireZipcrypto() {
  if (hasRequiredZipcrypto) return zipcrypto;
  hasRequiredZipcrypto = 1;
  const { randomFillSync } = require$$0;
  const Errors = requireErrors();
  const crctable = new Uint32Array(256).map((t, crc) => {
    for (let j = 0; j < 8; j++) {
      if (0 !== (crc & 1)) {
        crc = crc >>> 1 ^ 3988292384;
      } else {
        crc >>>= 1;
      }
    }
    return crc >>> 0;
  });
  const uMul = (a, b) => Math.imul(a, b) >>> 0;
  const crc32update = (pCrc32, bval) => {
    return crctable[(pCrc32 ^ bval) & 255] ^ pCrc32 >>> 8;
  };
  const genSalt = () => {
    if ("function" === typeof randomFillSync) {
      return randomFillSync(Buffer.alloc(12));
    } else {
      return genSalt.node();
    }
  };
  genSalt.node = () => {
    const salt = Buffer.alloc(12);
    const len = salt.length;
    for (let i = 0; i < len; i++) salt[i] = Math.random() * 256 & 255;
    return salt;
  };
  const config = {
    genSalt
  };
  function Initkeys(pw) {
    const pass = Buffer.isBuffer(pw) ? pw : Buffer.from(pw);
    this.keys = new Uint32Array([305419896, 591751049, 878082192]);
    for (let i = 0; i < pass.length; i++) {
      this.updateKeys(pass[i]);
    }
  }
  Initkeys.prototype.updateKeys = function(byteValue) {
    const keys = this.keys;
    keys[0] = crc32update(keys[0], byteValue);
    keys[1] += keys[0] & 255;
    keys[1] = uMul(keys[1], 134775813) + 1;
    keys[2] = crc32update(keys[2], keys[1] >>> 24);
    return byteValue;
  };
  Initkeys.prototype.next = function() {
    const k = (this.keys[2] | 2) >>> 0;
    return uMul(k, k ^ 1) >> 8 & 255;
  };
  function make_decrypter(pwd) {
    const keys = new Initkeys(pwd);
    return function(data) {
      const result = Buffer.alloc(data.length);
      let pos2 = 0;
      for (let c of data) {
        result[pos2++] = keys.updateKeys(c ^ keys.next());
      }
      return result;
    };
  }
  function make_encrypter(pwd) {
    const keys = new Initkeys(pwd);
    return function(data, result, pos2 = 0) {
      if (!result) result = Buffer.alloc(data.length);
      for (let c of data) {
        const k = keys.next();
        result[pos2++] = c ^ k;
        keys.updateKeys(c);
      }
      return result;
    };
  }
  function decrypt(data, header, pwd) {
    if (!data || !Buffer.isBuffer(data) || data.length < 12) {
      return Buffer.alloc(0);
    }
    const decrypter = make_decrypter(pwd);
    const salt = decrypter(data.slice(0, 12));
    const verifyByte = (header.flags & 8) === 8 ? header.timeHighByte : header.crc >>> 24;
    if (salt[11] !== verifyByte) {
      throw Errors.WRONG_PASSWORD();
    }
    return decrypter(data.slice(12));
  }
  function _salter(data) {
    if (Buffer.isBuffer(data) && data.length >= 12) {
      config.genSalt = function() {
        return data.slice(0, 12);
      };
    } else if (data === "node") {
      config.genSalt = genSalt.node;
    } else {
      config.genSalt = genSalt;
    }
  }
  function encrypt(data, header, pwd, oldlike = false) {
    if (data == null) data = Buffer.alloc(0);
    if (!Buffer.isBuffer(data)) data = Buffer.from(data.toString());
    const encrypter = make_encrypter(pwd);
    const salt = config.genSalt();
    salt[11] = header.crc >>> 24 & 255;
    if (oldlike) salt[10] = header.crc >>> 16 & 255;
    const result = Buffer.alloc(data.length + 12);
    encrypter(salt, result);
    return encrypter(data, result, 12);
  }
  zipcrypto = { decrypt, encrypt, _salter };
  return zipcrypto;
}
var hasRequiredMethods;
function requireMethods() {
  if (hasRequiredMethods) return methods;
  hasRequiredMethods = 1;
  methods.Deflater = requireDeflater();
  methods.Inflater = requireInflater();
  methods.ZipCrypto = requireZipcrypto();
  return methods;
}
var zipEntry;
var hasRequiredZipEntry;
function requireZipEntry() {
  if (hasRequiredZipEntry) return zipEntry;
  hasRequiredZipEntry = 1;
  var Utils = requireUtil(), Headers = requireHeaders(), Constants = Utils.Constants, Methods = requireMethods();
  zipEntry = function(options, input) {
    var _centralHeader = new Headers.EntryHeader(), _entryName = Buffer.alloc(0), _comment = Buffer.alloc(0), _isDirectory = false, uncompressedData = null, _extra = Buffer.alloc(0), _extralocal = Buffer.alloc(0), _efs = true;
    const opts = options;
    const decoder2 = typeof opts.decoder === "object" ? opts.decoder : Utils.decoder;
    _efs = decoder2.hasOwnProperty("efs") ? decoder2.efs : false;
    function getCompressedDataFromZip() {
      if (!input || !(input instanceof Uint8Array)) {
        return Buffer.alloc(0);
      }
      _extralocal = _centralHeader.loadLocalHeaderFromBinary(input);
      return input.slice(_centralHeader.realDataOffset, _centralHeader.realDataOffset + _centralHeader.compressedSize);
    }
    function crc32OK(data) {
      if (!_centralHeader.flags_desc) {
        if (Utils.crc32(data) !== _centralHeader.localHeader.crc) {
          return false;
        }
      } else {
        const descriptor = {};
        const dataEndOffset = _centralHeader.realDataOffset + _centralHeader.compressedSize;
        if (input.readUInt32LE(dataEndOffset) == Constants.LOCSIG || input.readUInt32LE(dataEndOffset) == Constants.CENSIG) {
          throw Utils.Errors.DESCRIPTOR_NOT_EXIST();
        }
        if (input.readUInt32LE(dataEndOffset) == Constants.EXTSIG) {
          descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC);
          descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ);
          descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN);
        } else if (input.readUInt16LE(dataEndOffset + 12) === 19280) {
          descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC - 4);
          descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ - 4);
          descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN - 4);
        } else {
          throw Utils.Errors.DESCRIPTOR_UNKNOWN();
        }
        if (descriptor.compressedSize !== _centralHeader.compressedSize || descriptor.size !== _centralHeader.size || descriptor.crc !== _centralHeader.crc) {
          throw Utils.Errors.DESCRIPTOR_FAULTY();
        }
        if (Utils.crc32(data) !== descriptor.crc) {
          return false;
        }
      }
      return true;
    }
    function decompress(async, callback, pass) {
      if (typeof callback === "undefined" && typeof async === "string") {
        pass = async;
        async = void 0;
      }
      if (_isDirectory) {
        if (async && callback) {
          callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR());
        }
        return Buffer.alloc(0);
      }
      var compressedData = getCompressedDataFromZip();
      if (compressedData.length === 0) {
        if (async && callback) callback(compressedData);
        return compressedData;
      }
      if (_centralHeader.encrypted) {
        if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
          throw Utils.Errors.INVALID_PASS_PARAM();
        }
        compressedData = Methods.ZipCrypto.decrypt(compressedData, _centralHeader, pass);
      }
      var data = Buffer.alloc(_centralHeader.size);
      switch (_centralHeader.method) {
        case Utils.Constants.STORED:
          compressedData.copy(data);
          if (!crc32OK(data)) {
            if (async && callback) callback(data, Utils.Errors.BAD_CRC());
            throw Utils.Errors.BAD_CRC();
          } else {
            if (async && callback) callback(data);
            return data;
          }
        case Utils.Constants.DEFLATED:
          var inflater2 = new Methods.Inflater(compressedData, _centralHeader.size);
          if (!async) {
            const result = inflater2.inflate(data);
            result.copy(data, 0);
            if (!crc32OK(data)) {
              throw Utils.Errors.BAD_CRC(`"${decoder2.decode(_entryName)}"`);
            }
            return data;
          } else {
            inflater2.inflateAsync(function(result) {
              result.copy(result, 0);
              if (callback) {
                if (!crc32OK(result)) {
                  callback(result, Utils.Errors.BAD_CRC());
                } else {
                  callback(result);
                }
              }
            });
          }
          break;
        default:
          if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD());
          throw Utils.Errors.UNKNOWN_METHOD();
      }
    }
    function compress(async, callback) {
      if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
        if (async && callback) callback(getCompressedDataFromZip());
        return getCompressedDataFromZip();
      }
      if (uncompressedData.length && !_isDirectory) {
        var compressedData;
        switch (_centralHeader.method) {
          case Utils.Constants.STORED:
            _centralHeader.compressedSize = _centralHeader.size;
            compressedData = Buffer.alloc(uncompressedData.length);
            uncompressedData.copy(compressedData);
            if (async && callback) callback(compressedData);
            return compressedData;
          default:
          case Utils.Constants.DEFLATED:
            var deflater2 = new Methods.Deflater(uncompressedData);
            if (!async) {
              var deflated = deflater2.deflate();
              _centralHeader.compressedSize = deflated.length;
              return deflated;
            } else {
              deflater2.deflateAsync(function(data) {
                compressedData = Buffer.alloc(data.length);
                _centralHeader.compressedSize = data.length;
                data.copy(compressedData);
                callback && callback(compressedData);
              });
            }
            deflater2 = null;
            break;
        }
      } else if (async && callback) {
        callback(Buffer.alloc(0));
      } else {
        return Buffer.alloc(0);
      }
    }
    function readUInt64LE(buffer, offset) {
      return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
    }
    function parseExtra(data) {
      try {
        var offset = 0;
        var signature, size, part;
        while (offset + 4 < data.length) {
          signature = data.readUInt16LE(offset);
          offset += 2;
          size = data.readUInt16LE(offset);
          offset += 2;
          part = data.slice(offset, offset + size);
          offset += size;
          if (Constants.ID_ZIP64 === signature) {
            parseZip64ExtendedInformation(part);
          }
        }
      } catch (error) {
        throw Utils.Errors.EXTRA_FIELD_PARSE_ERROR();
      }
    }
    function parseZip64ExtendedInformation(data) {
      var size, compressedSize, offset, diskNumStart;
      if (data.length >= Constants.EF_ZIP64_SCOMP) {
        size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
        if (_centralHeader.size === Constants.EF_ZIP64_OR_32) {
          _centralHeader.size = size;
        }
      }
      if (data.length >= Constants.EF_ZIP64_RHO) {
        compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
        if (_centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
          _centralHeader.compressedSize = compressedSize;
        }
      }
      if (data.length >= Constants.EF_ZIP64_DSN) {
        offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
        if (_centralHeader.offset === Constants.EF_ZIP64_OR_32) {
          _centralHeader.offset = offset;
        }
      }
      if (data.length >= Constants.EF_ZIP64_DSN + 4) {
        diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
        if (_centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
          _centralHeader.diskNumStart = diskNumStart;
        }
      }
    }
    return {
      get entryName() {
        return decoder2.decode(_entryName);
      },
      get rawEntryName() {
        return _entryName;
      },
      set entryName(val) {
        _entryName = Utils.toBuffer(val, decoder2.encode);
        var lastChar = _entryName[_entryName.length - 1];
        _isDirectory = lastChar === 47 || lastChar === 92;
        _centralHeader.fileNameLength = _entryName.length;
      },
      get efs() {
        if (typeof _efs === "function") {
          return _efs(this.entryName);
        } else {
          return _efs;
        }
      },
      get extra() {
        return _extra;
      },
      set extra(val) {
        _extra = val;
        _centralHeader.extraLength = val.length;
        parseExtra(val);
      },
      get comment() {
        return decoder2.decode(_comment);
      },
      set comment(val) {
        _comment = Utils.toBuffer(val, decoder2.encode);
        _centralHeader.commentLength = _comment.length;
        if (_comment.length > 65535) throw Utils.Errors.COMMENT_TOO_LONG();
      },
      get name() {
        var n = decoder2.decode(_entryName);
        return _isDirectory ? n.substr(n.length - 1).split("/").pop() : n.split("/").pop();
      },
      get isDirectory() {
        return _isDirectory;
      },
      getCompressedData: function() {
        return compress(false, null);
      },
      getCompressedDataAsync: function(callback) {
        compress(true, callback);
      },
      setData: function(value) {
        uncompressedData = Utils.toBuffer(value, Utils.decoder.encode);
        if (!_isDirectory && uncompressedData.length) {
          _centralHeader.size = uncompressedData.length;
          _centralHeader.method = Utils.Constants.DEFLATED;
          _centralHeader.crc = Utils.crc32(value);
          _centralHeader.changed = true;
        } else {
          _centralHeader.method = Utils.Constants.STORED;
        }
      },
      getData: function(pass) {
        if (_centralHeader.changed) {
          return uncompressedData;
        } else {
          return decompress(false, null, pass);
        }
      },
      getDataAsync: function(callback, pass) {
        if (_centralHeader.changed) {
          callback(uncompressedData);
        } else {
          decompress(true, callback, pass);
        }
      },
      set attr(attr) {
        _centralHeader.attr = attr;
      },
      get attr() {
        return _centralHeader.attr;
      },
      set header(data) {
        _centralHeader.loadFromBinary(data);
      },
      get header() {
        return _centralHeader;
      },
      packCentralHeader: function() {
        _centralHeader.flags_efs = this.efs;
        _centralHeader.extraLength = _extra.length;
        var header = _centralHeader.centralHeaderToBinary();
        var addpos = Utils.Constants.CENHDR;
        _entryName.copy(header, addpos);
        addpos += _entryName.length;
        _extra.copy(header, addpos);
        addpos += _centralHeader.extraLength;
        _comment.copy(header, addpos);
        return header;
      },
      packLocalHeader: function() {
        let addpos = 0;
        _centralHeader.flags_efs = this.efs;
        _centralHeader.extraLocalLength = _extralocal.length;
        const localHeaderBuf = _centralHeader.localHeaderToBinary();
        const localHeader = Buffer.alloc(localHeaderBuf.length + _entryName.length + _centralHeader.extraLocalLength);
        localHeaderBuf.copy(localHeader, addpos);
        addpos += localHeaderBuf.length;
        _entryName.copy(localHeader, addpos);
        addpos += _entryName.length;
        _extralocal.copy(localHeader, addpos);
        addpos += _extralocal.length;
        return localHeader;
      },
      toJSON: function() {
        const bytes = function(nr) {
          return "<" + (nr && nr.length + " bytes buffer" || "null") + ">";
        };
        return {
          entryName: this.entryName,
          name: this.name,
          comment: this.comment,
          isDirectory: this.isDirectory,
          header: _centralHeader.toJSON(),
          compressedData: bytes(input),
          data: bytes(uncompressedData)
        };
      },
      toString: function() {
        return JSON.stringify(this.toJSON(), null, "	");
      }
    };
  };
  return zipEntry;
}
var zipFile;
var hasRequiredZipFile;
function requireZipFile() {
  if (hasRequiredZipFile) return zipFile;
  hasRequiredZipFile = 1;
  const ZipEntry = requireZipEntry();
  const Headers = requireHeaders();
  const Utils = requireUtil();
  zipFile = function(inBuffer, options) {
    var entryList = [], entryTable = {}, _comment = Buffer.alloc(0), mainHeader2 = new Headers.MainHeader(), loadedEntries = false;
    const temporary = /* @__PURE__ */ new Set();
    const opts = options;
    const { noSort, decoder: decoder2 } = opts;
    if (inBuffer) {
      readMainHeader(opts.readEntries);
    } else {
      loadedEntries = true;
    }
    function makeTemporaryFolders() {
      const foldersList = /* @__PURE__ */ new Set();
      for (const elem of Object.keys(entryTable)) {
        const elements = elem.split("/");
        elements.pop();
        if (!elements.length) continue;
        for (let i = 0; i < elements.length; i++) {
          const sub = elements.slice(0, i + 1).join("/") + "/";
          foldersList.add(sub);
        }
      }
      for (const elem of foldersList) {
        if (!(elem in entryTable)) {
          const tempfolder = new ZipEntry(opts);
          tempfolder.entryName = elem;
          tempfolder.attr = 16;
          tempfolder.temporary = true;
          entryList.push(tempfolder);
          entryTable[tempfolder.entryName] = tempfolder;
          temporary.add(tempfolder);
        }
      }
    }
    function readEntries() {
      loadedEntries = true;
      entryTable = {};
      if (mainHeader2.diskEntries > (inBuffer.length - mainHeader2.offset) / Utils.Constants.CENHDR) {
        throw Utils.Errors.DISK_ENTRY_TOO_LARGE();
      }
      entryList = new Array(mainHeader2.diskEntries);
      var index = mainHeader2.offset;
      for (var i = 0; i < entryList.length; i++) {
        var tmp = index, entry = new ZipEntry(opts, inBuffer);
        entry.header = inBuffer.slice(tmp, tmp += Utils.Constants.CENHDR);
        entry.entryName = inBuffer.slice(tmp, tmp += entry.header.fileNameLength);
        if (entry.header.extraLength) {
          entry.extra = inBuffer.slice(tmp, tmp += entry.header.extraLength);
        }
        if (entry.header.commentLength) entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);
        index += entry.header.centralHeaderSize;
        entryList[i] = entry;
        entryTable[entry.entryName] = entry;
      }
      temporary.clear();
      makeTemporaryFolders();
    }
    function readMainHeader(readNow) {
      var i = inBuffer.length - Utils.Constants.ENDHDR, max = Math.max(0, i - 65535), n = max, endStart = inBuffer.length, endOffset = -1, commentEnd = 0;
      const trailingSpace = typeof opts.trailingSpace === "boolean" ? opts.trailingSpace : false;
      if (trailingSpace) max = 0;
      for (i; i >= n; i--) {
        if (inBuffer[i] !== 80) continue;
        if (inBuffer.readUInt32LE(i) === Utils.Constants.ENDSIG) {
          endOffset = i;
          commentEnd = i;
          endStart = i + Utils.Constants.ENDHDR;
          n = i - Utils.Constants.END64HDR;
          continue;
        }
        if (inBuffer.readUInt32LE(i) === Utils.Constants.END64SIG) {
          n = max;
          continue;
        }
        if (inBuffer.readUInt32LE(i) === Utils.Constants.ZIP64SIG) {
          endOffset = i;
          endStart = i + Utils.readBigUInt64LE(inBuffer, i + Utils.Constants.ZIP64SIZE) + Utils.Constants.ZIP64LEAD;
          break;
        }
      }
      if (endOffset == -1) throw Utils.Errors.INVALID_FORMAT();
      mainHeader2.loadFromBinary(inBuffer.slice(endOffset, endStart));
      if (mainHeader2.commentLength) {
        _comment = inBuffer.slice(commentEnd + Utils.Constants.ENDHDR);
      }
      if (readNow) readEntries();
    }
    function sortEntries() {
      if (entryList.length > 1 && !noSort) {
        entryList.sort((a, b) => a.entryName.toLowerCase().localeCompare(b.entryName.toLowerCase()));
      }
    }
    return {
      /**
       * Returns an array of ZipEntry objects existent in the current opened archive
       * @return Array
       */
      get entries() {
        if (!loadedEntries) {
          readEntries();
        }
        return entryList.filter((e) => !temporary.has(e));
      },
      /**
       * Archive comment
       * @return {String}
       */
      get comment() {
        return decoder2.decode(_comment);
      },
      set comment(val) {
        _comment = Utils.toBuffer(val, decoder2.encode);
        mainHeader2.commentLength = _comment.length;
      },
      getEntryCount: function() {
        if (!loadedEntries) {
          return mainHeader2.diskEntries;
        }
        return entryList.length;
      },
      forEach: function(callback) {
        this.entries.forEach(callback);
      },
      /**
       * Returns a reference to the entry with the given name or null if entry is inexistent
       *
       * @param entryName
       * @return ZipEntry
       */
      getEntry: function(entryName) {
        if (!loadedEntries) {
          readEntries();
        }
        return entryTable[entryName] || null;
      },
      /**
       * Adds the given entry to the entry list
       *
       * @param entry
       */
      setEntry: function(entry) {
        if (!loadedEntries) {
          readEntries();
        }
        entryList.push(entry);
        entryTable[entry.entryName] = entry;
        mainHeader2.totalEntries = entryList.length;
      },
      /**
       * Removes the file with the given name from the entry list.
       *
       * If the entry is a directory, then all nested files and directories will be removed
       * @param entryName
       * @returns {void}
       */
      deleteFile: function(entryName, withsubfolders = true) {
        if (!loadedEntries) {
          readEntries();
        }
        const entry = entryTable[entryName];
        const list2 = this.getEntryChildren(entry, withsubfolders).map((child) => child.entryName);
        list2.forEach(this.deleteEntry);
      },
      /**
       * Removes the entry with the given name from the entry list.
       *
       * @param {string} entryName
       * @returns {void}
       */
      deleteEntry: function(entryName) {
        if (!loadedEntries) {
          readEntries();
        }
        const entry = entryTable[entryName];
        const index = entryList.indexOf(entry);
        if (index >= 0) {
          entryList.splice(index, 1);
          delete entryTable[entryName];
          mainHeader2.totalEntries = entryList.length;
        }
      },
      /**
       *  Iterates and returns all nested files and directories of the given entry
       *
       * @param entry
       * @return Array
       */
      getEntryChildren: function(entry, subfolders = true) {
        if (!loadedEntries) {
          readEntries();
        }
        if (typeof entry === "object") {
          if (entry.isDirectory && subfolders) {
            const list2 = [];
            const name2 = entry.entryName;
            for (const zipEntry2 of entryList) {
              if (zipEntry2.entryName.startsWith(name2)) {
                list2.push(zipEntry2);
              }
            }
            return list2;
          } else {
            return [entry];
          }
        }
        return [];
      },
      /**
       *  How many child elements entry has
       *
       * @param {ZipEntry} entry
       * @return {integer}
       */
      getChildCount: function(entry) {
        if (entry && entry.isDirectory) {
          const list2 = this.getEntryChildren(entry);
          return list2.includes(entry) ? list2.length - 1 : list2.length;
        }
        return 0;
      },
      /**
       * Returns the zip file
       *
       * @return Buffer
       */
      compressToBuffer: function() {
        if (!loadedEntries) {
          readEntries();
        }
        sortEntries();
        const dataBlock = [];
        const headerBlocks = [];
        let totalSize = 0;
        let dindex = 0;
        mainHeader2.size = 0;
        mainHeader2.offset = 0;
        let totalEntries = 0;
        for (const entry of this.entries) {
          const compressedData = entry.getCompressedData();
          entry.header.offset = dindex;
          const localHeader = entry.packLocalHeader();
          const dataLength = localHeader.length + compressedData.length;
          dindex += dataLength;
          dataBlock.push(localHeader);
          dataBlock.push(compressedData);
          const centralHeader = entry.packCentralHeader();
          headerBlocks.push(centralHeader);
          mainHeader2.size += centralHeader.length;
          totalSize += dataLength + centralHeader.length;
          totalEntries++;
        }
        totalSize += mainHeader2.mainHeaderSize;
        mainHeader2.offset = dindex;
        mainHeader2.totalEntries = totalEntries;
        dindex = 0;
        const outBuffer = Buffer.alloc(totalSize);
        for (const content of dataBlock) {
          content.copy(outBuffer, dindex);
          dindex += content.length;
        }
        for (const content of headerBlocks) {
          content.copy(outBuffer, dindex);
          dindex += content.length;
        }
        const mh = mainHeader2.toBinary();
        if (_comment) {
          _comment.copy(mh, Utils.Constants.ENDHDR);
        }
        mh.copy(outBuffer, dindex);
        inBuffer = outBuffer;
        loadedEntries = false;
        return outBuffer;
      },
      toAsyncBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
        try {
          if (!loadedEntries) {
            readEntries();
          }
          sortEntries();
          const dataBlock = [];
          const centralHeaders = [];
          let totalSize = 0;
          let dindex = 0;
          let totalEntries = 0;
          mainHeader2.size = 0;
          mainHeader2.offset = 0;
          const compress2Buffer = function(entryLists) {
            if (entryLists.length > 0) {
              const entry = entryLists.shift();
              const name2 = entry.entryName + entry.extra.toString();
              if (onItemStart) onItemStart(name2);
              entry.getCompressedDataAsync(function(compressedData) {
                if (onItemEnd) onItemEnd(name2);
                entry.header.offset = dindex;
                const localHeader = entry.packLocalHeader();
                const dataLength = localHeader.length + compressedData.length;
                dindex += dataLength;
                dataBlock.push(localHeader);
                dataBlock.push(compressedData);
                const centalHeader = entry.packCentralHeader();
                centralHeaders.push(centalHeader);
                mainHeader2.size += centalHeader.length;
                totalSize += dataLength + centalHeader.length;
                totalEntries++;
                compress2Buffer(entryLists);
              });
            } else {
              totalSize += mainHeader2.mainHeaderSize;
              mainHeader2.offset = dindex;
              mainHeader2.totalEntries = totalEntries;
              dindex = 0;
              const outBuffer = Buffer.alloc(totalSize);
              dataBlock.forEach(function(content) {
                content.copy(outBuffer, dindex);
                dindex += content.length;
              });
              centralHeaders.forEach(function(content) {
                content.copy(outBuffer, dindex);
                dindex += content.length;
              });
              const mh = mainHeader2.toBinary();
              if (_comment) {
                _comment.copy(mh, Utils.Constants.ENDHDR);
              }
              mh.copy(outBuffer, dindex);
              inBuffer = outBuffer;
              loadedEntries = false;
              onSuccess(outBuffer);
            }
          };
          compress2Buffer(Array.from(this.entries));
        } catch (e) {
          onFail(e);
        }
      }
    };
  };
  return zipFile;
}
var admZip;
var hasRequiredAdmZip;
function requireAdmZip() {
  if (hasRequiredAdmZip) return admZip;
  hasRequiredAdmZip = 1;
  const Utils = requireUtil();
  const pth = path;
  const ZipEntry = requireZipEntry();
  const ZipFile = requireZipFile();
  const get_Bool = (...val) => Utils.findLast(val, (c) => typeof c === "boolean");
  const get_Str = (...val) => Utils.findLast(val, (c) => typeof c === "string");
  const get_Fun = (...val) => Utils.findLast(val, (c) => typeof c === "function");
  const defaultOptions = {
    // option "noSort" : if true it disables files sorting
    noSort: false,
    // read entries during load (initial loading may be slower)
    readEntries: false,
    // default method is none
    method: Utils.Constants.NONE,
    // file system
    fs: null
  };
  admZip = function(input, options) {
    let inBuffer = null;
    const opts = Object.assign(/* @__PURE__ */ Object.create(null), defaultOptions);
    if (input && "object" === typeof input) {
      if (!(input instanceof Uint8Array)) {
        Object.assign(opts, input);
        input = opts.input ? opts.input : void 0;
        if (opts.input) delete opts.input;
      }
      if (Buffer.isBuffer(input)) {
        inBuffer = input;
        opts.method = Utils.Constants.BUFFER;
        input = void 0;
      }
    }
    Object.assign(opts, options);
    const filetools = new Utils(opts);
    if (typeof opts.decoder !== "object" || typeof opts.decoder.encode !== "function" || typeof opts.decoder.decode !== "function") {
      opts.decoder = Utils.decoder;
    }
    if (input && "string" === typeof input) {
      if (filetools.fs.existsSync(input)) {
        opts.method = Utils.Constants.FILE;
        opts.filename = input;
        inBuffer = filetools.fs.readFileSync(input);
      } else {
        throw Utils.Errors.INVALID_FILENAME();
      }
    }
    const _zip = new ZipFile(inBuffer, opts);
    const { canonical, sanitize, zipnamefix } = Utils;
    function getEntry(entry) {
      if (entry && _zip) {
        var item;
        if (typeof entry === "string") item = _zip.getEntry(pth.posix.normalize(entry));
        if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined") item = _zip.getEntry(entry.entryName);
        if (item) {
          return item;
        }
      }
      return null;
    }
    function fixPath(zipPath) {
      const { join: join2, normalize, sep } = pth.posix;
      return join2(".", normalize(sep + zipPath.split("\\").join(sep) + sep));
    }
    function filenameFilter(filterfn) {
      if (filterfn instanceof RegExp) {
        return /* @__PURE__ */ (function(rx) {
          return function(filename) {
            return rx.test(filename);
          };
        })(filterfn);
      } else if ("function" !== typeof filterfn) {
        return () => true;
      }
      return filterfn;
    }
    const relativePath = (local, entry) => {
      let lastChar = entry.slice(-1);
      lastChar = lastChar === filetools.sep ? filetools.sep : "";
      return pth.relative(local, entry) + lastChar;
    };
    return {
      /**
       * Extracts the given entry from the archive and returns the content as a Buffer object
       * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
       * @param {Buffer|string} [pass] - password
       * @return Buffer or Null in case of error
       */
      readFile: function(entry, pass) {
        var item = getEntry(entry);
        return item && item.getData(pass) || null;
      },
      /**
       * Returns how many child elements has on entry (directories) on files it is always 0
       * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
       * @returns {integer}
       */
      childCount: function(entry) {
        const item = getEntry(entry);
        if (item) {
          return _zip.getChildCount(item);
        }
      },
      /**
       * Asynchronous readFile
       * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
       * @param {callback} callback
       *
       * @return Buffer or Null in case of error
       */
      readFileAsync: function(entry, callback) {
        var item = getEntry(entry);
        if (item) {
          item.getDataAsync(callback);
        } else {
          callback(null, "getEntry failed for:" + entry);
        }
      },
      /**
       * Extracts the given entry from the archive and returns the content as plain text in the given encoding
       * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
       * @param {string} encoding - Optional. If no encoding is specified utf8 is used
       *
       * @return String
       */
      readAsText: function(entry, encoding) {
        var item = getEntry(entry);
        if (item) {
          var data = item.getData();
          if (data && data.length) {
            return data.toString(encoding || "utf8");
          }
        }
        return "";
      },
      /**
       * Asynchronous readAsText
       * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
       * @param {callback} callback
       * @param {string} [encoding] - Optional. If no encoding is specified utf8 is used
       *
       * @return String
       */
      readAsTextAsync: function(entry, callback, encoding) {
        var item = getEntry(entry);
        if (item) {
          item.getDataAsync(function(data, err) {
            if (err) {
              callback(data, err);
              return;
            }
            if (data && data.length) {
              callback(data.toString(encoding || "utf8"));
            } else {
              callback("");
            }
          });
        } else {
          callback("");
        }
      },
      /**
       * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
       *
       * @param {ZipEntry|string} entry
       * @returns {void}
       */
      deleteFile: function(entry, withsubfolders = true) {
        var item = getEntry(entry);
        if (item) {
          _zip.deleteFile(item.entryName, withsubfolders);
        }
      },
      /**
       * Remove the entry from the file or directory without affecting any nested entries
       *
       * @param {ZipEntry|string} entry
       * @returns {void}
       */
      deleteEntry: function(entry) {
        var item = getEntry(entry);
        if (item) {
          _zip.deleteEntry(item.entryName);
        }
      },
      /**
       * Adds a comment to the zip. The zip must be rewritten after adding the comment.
       *
       * @param {string} comment
       */
      addZipComment: function(comment) {
        _zip.comment = comment;
      },
      /**
       * Returns the zip comment
       *
       * @return String
       */
      getZipComment: function() {
        return _zip.comment || "";
      },
      /**
       * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
       * The comment cannot exceed 65535 characters in length
       *
       * @param {ZipEntry} entry
       * @param {string} comment
       */
      addZipEntryComment: function(entry, comment) {
        var item = getEntry(entry);
        if (item) {
          item.comment = comment;
        }
      },
      /**
       * Returns the comment of the specified entry
       *
       * @param {ZipEntry} entry
       * @return String
       */
      getZipEntryComment: function(entry) {
        var item = getEntry(entry);
        if (item) {
          return item.comment || "";
        }
        return "";
      },
      /**
       * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
       *
       * @param {ZipEntry} entry
       * @param {Buffer} content
       */
      updateFile: function(entry, content) {
        var item = getEntry(entry);
        if (item) {
          item.setData(content);
        }
      },
      /**
       * Adds a file from the disk to the archive
       *
       * @param {string} localPath File to add to zip
       * @param {string} [zipPath] Optional path inside the zip
       * @param {string} [zipName] Optional name for the file
       * @param {string} [comment] Optional file comment
       */
      addLocalFile: function(localPath2, zipPath, zipName, comment) {
        if (filetools.fs.existsSync(localPath2)) {
          zipPath = zipPath ? fixPath(zipPath) : "";
          const p = pth.win32.basename(pth.win32.normalize(localPath2));
          zipPath += zipName ? zipName : p;
          const _attr = filetools.fs.statSync(localPath2);
          const data = _attr.isFile() ? filetools.fs.readFileSync(localPath2) : Buffer.alloc(0);
          if (_attr.isDirectory()) zipPath += filetools.sep;
          this.addFile(zipPath, data, comment, _attr);
        } else {
          throw Utils.Errors.FILE_NOT_FOUND(localPath2);
        }
      },
      /**
       * Callback for showing if everything was done.
       *
       * @callback doneCallback
       * @param {Error} err - Error object
       * @param {boolean} done - was request fully completed
       */
      /**
       * Adds a file from the disk to the archive
       *
       * @param {(object|string)} options - options object, if it is string it us used as localPath.
       * @param {string} options.localPath - Local path to the file.
       * @param {string} [options.comment] - Optional file comment.
       * @param {string} [options.zipPath] - Optional path inside the zip
       * @param {string} [options.zipName] - Optional name for the file
       * @param {doneCallback} callback - The callback that handles the response.
       */
      addLocalFileAsync: function(options2, callback) {
        options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
        const localPath2 = pth.resolve(options2.localPath);
        const { comment } = options2;
        let { zipPath, zipName } = options2;
        const self = this;
        filetools.fs.stat(localPath2, function(err, stats2) {
          if (err) return callback(err, false);
          zipPath = zipPath ? fixPath(zipPath) : "";
          const p = pth.win32.basename(pth.win32.normalize(localPath2));
          zipPath += zipName ? zipName : p;
          if (stats2.isFile()) {
            filetools.fs.readFile(localPath2, function(err2, data) {
              if (err2) return callback(err2, false);
              self.addFile(zipPath, data, comment, stats2);
              return setImmediate(callback, void 0, true);
            });
          } else if (stats2.isDirectory()) {
            zipPath += filetools.sep;
            self.addFile(zipPath, Buffer.alloc(0), comment, stats2);
            return setImmediate(callback, void 0, true);
          }
        });
      },
      /**
       * Adds a local directory and all its nested files and directories to the archive
       *
       * @param {string} localPath - local path to the folder
       * @param {string} [zipPath] - optional path inside zip
       * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
       */
      addLocalFolder: function(localPath2, zipPath, filter) {
        filter = filenameFilter(filter);
        zipPath = zipPath ? fixPath(zipPath) : "";
        localPath2 = pth.normalize(localPath2);
        if (filetools.fs.existsSync(localPath2)) {
          const items = filetools.findFiles(localPath2);
          const self = this;
          if (items.length) {
            for (const filepath of items) {
              const p = pth.join(zipPath, relativePath(localPath2, filepath));
              if (filter(p)) {
                self.addLocalFile(filepath, pth.dirname(p));
              }
            }
          }
        } else {
          throw Utils.Errors.FILE_NOT_FOUND(localPath2);
        }
      },
      /**
       * Asynchronous addLocalFolder
       * @param {string} localPath
       * @param {callback} callback
       * @param {string} [zipPath] optional path inside zip
       * @param {RegExp|function} [filter] optional RegExp or Function if files match will
       *               be included.
       */
      addLocalFolderAsync: function(localPath2, callback, zipPath, filter) {
        filter = filenameFilter(filter);
        zipPath = zipPath ? fixPath(zipPath) : "";
        localPath2 = pth.normalize(localPath2);
        var self = this;
        filetools.fs.open(localPath2, "r", function(err) {
          if (err && err.code === "ENOENT") {
            callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath2));
          } else if (err) {
            callback(void 0, err);
          } else {
            var items = filetools.findFiles(localPath2);
            var i = -1;
            var next = function() {
              i += 1;
              if (i < items.length) {
                var filepath = items[i];
                var p = relativePath(localPath2, filepath).split("\\").join("/");
                p = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
                if (filter(p)) {
                  filetools.fs.stat(filepath, function(er0, stats2) {
                    if (er0) callback(void 0, er0);
                    if (stats2.isFile()) {
                      filetools.fs.readFile(filepath, function(er1, data) {
                        if (er1) {
                          callback(void 0, er1);
                        } else {
                          self.addFile(zipPath + p, data, "", stats2);
                          next();
                        }
                      });
                    } else {
                      self.addFile(zipPath + p + "/", Buffer.alloc(0), "", stats2);
                      next();
                    }
                  });
                } else {
                  process.nextTick(() => {
                    next();
                  });
                }
              } else {
                callback(true, void 0);
              }
            };
            next();
          }
        });
      },
      /**
       * Adds a local directory and all its nested files and directories to the archive
       *
       * @param {object | string} options - options object, if it is string it us used as localPath.
       * @param {string} options.localPath - Local path to the folder.
       * @param {string} [options.zipPath] - optional path inside zip.
       * @param {RegExp|function} [options.filter] - optional RegExp or Function if files match will be included.
       * @param {function|string} [options.namefix] - optional function to help fix filename
       * @param {doneCallback} callback - The callback that handles the response.
       *
       */
      addLocalFolderAsync2: function(options2, callback) {
        const self = this;
        options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
        localPath = pth.resolve(fixPath(options2.localPath));
        let { zipPath, filter, namefix } = options2;
        if (filter instanceof RegExp) {
          filter = /* @__PURE__ */ (function(rx) {
            return function(filename) {
              return rx.test(filename);
            };
          })(filter);
        } else if ("function" !== typeof filter) {
          filter = function() {
            return true;
          };
        }
        zipPath = zipPath ? fixPath(zipPath) : "";
        if (namefix == "latin1") {
          namefix = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
        }
        if (typeof namefix !== "function") namefix = (str) => str;
        const relPathFix = (entry) => pth.join(zipPath, namefix(relativePath(localPath, entry)));
        const fileNameFix = (entry) => pth.win32.basename(pth.win32.normalize(namefix(entry)));
        filetools.fs.open(localPath, "r", function(err) {
          if (err && err.code === "ENOENT") {
            callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath));
          } else if (err) {
            callback(void 0, err);
          } else {
            filetools.findFilesAsync(localPath, function(err2, fileEntries) {
              if (err2) return callback(err2);
              fileEntries = fileEntries.filter((dir) => filter(relPathFix(dir)));
              if (!fileEntries.length) callback(void 0, false);
              setImmediate(
                fileEntries.reverse().reduce(function(next, entry) {
                  return function(err3, done) {
                    if (err3 || done === false) return setImmediate(next, err3, false);
                    self.addLocalFileAsync(
                      {
                        localPath: entry,
                        zipPath: pth.dirname(relPathFix(entry)),
                        zipName: fileNameFix(entry)
                      },
                      next
                    );
                  };
                }, callback)
              );
            });
          }
        });
      },
      /**
       * Adds a local directory and all its nested files and directories to the archive
       *
       * @param {string} localPath - path where files will be extracted
       * @param {object} props - optional properties
       * @param {string} [props.zipPath] - optional path inside zip
       * @param {RegExp|function} [props.filter] - optional RegExp or Function if files match will be included.
       * @param {function|string} [props.namefix] - optional function to help fix filename
       */
      addLocalFolderPromise: function(localPath2, props) {
        return new Promise((resolve, reject) => {
          this.addLocalFolderAsync2(Object.assign({ localPath: localPath2 }, props), (err, done) => {
            if (err) reject(err);
            if (done) resolve(this);
          });
        });
      },
      /**
       * Allows you to create a entry (file or directory) in the zip file.
       * If you want to create a directory the entryName must end in / and a null buffer should be provided.
       * Comment and attributes are optional
       *
       * @param {string} entryName
       * @param {Buffer | string} content - file content as buffer or utf8 coded string
       * @param {string} [comment] - file comment
       * @param {number | object} [attr] - number as unix file permissions, object as filesystem Stats object
       */
      addFile: function(entryName, content, comment, attr) {
        entryName = zipnamefix(entryName);
        let entry = getEntry(entryName);
        const update = entry != null;
        if (!update) {
          entry = new ZipEntry(opts);
          entry.entryName = entryName;
        }
        entry.comment = comment || "";
        const isStat = "object" === typeof attr && attr instanceof filetools.fs.Stats;
        if (isStat) {
          entry.header.time = attr.mtime;
        }
        var fileattr = entry.isDirectory ? 16 : 0;
        let unix = entry.isDirectory ? 16384 : 32768;
        if (isStat) {
          unix |= 4095 & attr.mode;
        } else if ("number" === typeof attr) {
          unix |= 4095 & attr;
        } else {
          unix |= entry.isDirectory ? 493 : 420;
        }
        fileattr = (fileattr | unix << 16) >>> 0;
        entry.attr = fileattr;
        entry.setData(content);
        if (!update) _zip.setEntry(entry);
        return entry;
      },
      /**
       * Returns an array of ZipEntry objects representing the files and folders inside the archive
       *
       * @param {string} [password]
       * @returns Array
       */
      getEntries: function(password) {
        _zip.password = password;
        return _zip ? _zip.entries : [];
      },
      /**
       * Returns a ZipEntry object representing the file or folder specified by ``name``.
       *
       * @param {string} name
       * @return ZipEntry
       */
      getEntry: function(name2) {
        return getEntry(name2);
      },
      getEntryCount: function() {
        return _zip.getEntryCount();
      },
      forEach: function(callback) {
        return _zip.forEach(callback);
      },
      /**
       * Extracts the given entry to the given targetPath
       * If the entry is a directory inside the archive, the entire directory and it's subdirectories will be extracted
       *
       * @param {string|ZipEntry} entry - ZipEntry object or String with the full path of the entry
       * @param {string} targetPath - Target folder where to write the file
       * @param {boolean} [maintainEntryPath=true] - If maintainEntryPath is true and the entry is inside a folder, the entry folder will be created in targetPath as well. Default is TRUE
       * @param {boolean} [overwrite=false] - If the file already exists at the target path, the file will be overwriten if this is true.
       * @param {boolean} [keepOriginalPermission=false] - The file will be set as the permission from the entry if this is true.
       * @param {string} [outFileName] - String If set will override the filename of the extracted file (Only works if the entry is a file)
       *
       * @return Boolean
       */
      extractEntryTo: function(entry, targetPath, maintainEntryPath, overwrite, keepOriginalPermission, outFileName) {
        overwrite = get_Bool(false, overwrite);
        keepOriginalPermission = get_Bool(false, keepOriginalPermission);
        maintainEntryPath = get_Bool(true, maintainEntryPath);
        outFileName = get_Str(keepOriginalPermission, outFileName);
        var item = getEntry(entry);
        if (!item) {
          throw Utils.Errors.NO_ENTRY();
        }
        var entryName = canonical(item.entryName);
        var target = sanitize(targetPath, outFileName && !item.isDirectory ? outFileName : maintainEntryPath ? entryName : pth.basename(entryName));
        if (item.isDirectory) {
          var children = _zip.getEntryChildren(item);
          children.forEach(function(child) {
            if (child.isDirectory) return;
            var content2 = child.getData();
            if (!content2) {
              throw Utils.Errors.CANT_EXTRACT_FILE();
            }
            var name2 = canonical(child.entryName);
            var childName = sanitize(targetPath, maintainEntryPath ? name2 : pth.basename(name2));
            const fileAttr2 = keepOriginalPermission ? child.header.fileAttr : void 0;
            filetools.writeFileTo(childName, content2, overwrite, fileAttr2);
          });
          return true;
        }
        var content = item.getData(_zip.password);
        if (!content) throw Utils.Errors.CANT_EXTRACT_FILE();
        if (filetools.fs.existsSync(target) && !overwrite) {
          throw Utils.Errors.CANT_OVERRIDE();
        }
        const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
        filetools.writeFileTo(target, content, overwrite, fileAttr);
        return true;
      },
      /**
       * Test the archive
       * @param {string} [pass]
       */
      test: function(pass) {
        if (!_zip) {
          return false;
        }
        for (var entry in _zip.entries) {
          try {
            if (entry.isDirectory) {
              continue;
            }
            var content = _zip.entries[entry].getData(pass);
            if (!content) {
              return false;
            }
          } catch (err) {
            return false;
          }
        }
        return true;
      },
      /**
       * Extracts the entire archive to the given location
       *
       * @param {string} targetPath Target location
       * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
       *                  Default is FALSE
       * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
       *                  Default is FALSE
       * @param {string|Buffer} [pass] password
       */
      extractAllTo: function(targetPath, overwrite, keepOriginalPermission, pass) {
        keepOriginalPermission = get_Bool(false, keepOriginalPermission);
        pass = get_Str(keepOriginalPermission, pass);
        overwrite = get_Bool(false, overwrite);
        if (!_zip) throw Utils.Errors.NO_ZIP();
        _zip.entries.forEach(function(entry) {
          var entryName = sanitize(targetPath, canonical(entry.entryName));
          if (entry.isDirectory) {
            filetools.makeDir(entryName);
            return;
          }
          var content = entry.getData(pass);
          if (!content) {
            throw Utils.Errors.CANT_EXTRACT_FILE();
          }
          const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
          filetools.writeFileTo(entryName, content, overwrite, fileAttr);
          try {
            filetools.fs.utimesSync(entryName, entry.header.time, entry.header.time);
          } catch (err) {
            throw Utils.Errors.CANT_EXTRACT_FILE();
          }
        });
      },
      /**
       * Asynchronous extractAllTo
       *
       * @param {string} targetPath Target location
       * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
       *                  Default is FALSE
       * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
       *                  Default is FALSE
       * @param {function} callback The callback will be executed when all entries are extracted successfully or any error is thrown.
       */
      extractAllToAsync: function(targetPath, overwrite, keepOriginalPermission, callback) {
        callback = get_Fun(overwrite, keepOriginalPermission, callback);
        keepOriginalPermission = get_Bool(false, keepOriginalPermission);
        overwrite = get_Bool(false, overwrite);
        if (!callback) {
          return new Promise((resolve, reject) => {
            this.extractAllToAsync(targetPath, overwrite, keepOriginalPermission, function(err) {
              if (err) {
                reject(err);
              } else {
                resolve(this);
              }
            });
          });
        }
        if (!_zip) {
          callback(Utils.Errors.NO_ZIP());
          return;
        }
        targetPath = pth.resolve(targetPath);
        const getPath = (entry) => sanitize(targetPath, pth.normalize(canonical(entry.entryName)));
        const getError = (msg, file) => new Error(msg + ': "' + file + '"');
        const dirEntries = [];
        const fileEntries = [];
        _zip.entries.forEach((e) => {
          if (e.isDirectory) {
            dirEntries.push(e);
          } else {
            fileEntries.push(e);
          }
        });
        for (const entry of dirEntries) {
          const dirPath = getPath(entry);
          const dirAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
          try {
            filetools.makeDir(dirPath);
            if (dirAttr) filetools.fs.chmodSync(dirPath, dirAttr);
            filetools.fs.utimesSync(dirPath, entry.header.time, entry.header.time);
          } catch (er) {
            callback(getError("Unable to create folder", dirPath));
          }
        }
        fileEntries.reverse().reduce(function(next, entry) {
          return function(err) {
            if (err) {
              next(err);
            } else {
              const entryName = pth.normalize(canonical(entry.entryName));
              const filePath = sanitize(targetPath, entryName);
              entry.getDataAsync(function(content, err_1) {
                if (err_1) {
                  next(err_1);
                } else if (!content) {
                  next(Utils.Errors.CANT_EXTRACT_FILE());
                } else {
                  const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
                  filetools.writeFileToAsync(filePath, content, overwrite, fileAttr, function(succ) {
                    if (!succ) {
                      next(getError("Unable to write file", filePath));
                    }
                    filetools.fs.utimes(filePath, entry.header.time, entry.header.time, function(err_2) {
                      if (err_2) {
                        next(getError("Unable to set times", filePath));
                      } else {
                        next();
                      }
                    });
                  });
                }
              });
            }
          };
        }, callback)();
      },
      /**
       * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
       *
       * @param {string} targetFileName
       * @param {function} callback
       */
      writeZip: function(targetFileName, callback) {
        if (arguments.length === 1) {
          if (typeof targetFileName === "function") {
            callback = targetFileName;
            targetFileName = "";
          }
        }
        if (!targetFileName && opts.filename) {
          targetFileName = opts.filename;
        }
        if (!targetFileName) return;
        var zipData = _zip.compressToBuffer();
        if (zipData) {
          var ok = filetools.writeFileTo(targetFileName, zipData, true);
          if (typeof callback === "function") callback(!ok ? new Error("failed") : null, "");
        }
      },
      /**
      	         *
      	         * @param {string} targetFileName
      	         * @param {object} [props]
      	         * @param {boolean} [props.overwrite=true] If the file already exists at the target path, the file will be overwriten if this is true.
      	         * @param {boolean} [props.perm] The file will be set as the permission from the entry if this is true.
      
      	         * @returns {Promise<void>}
      	         */
      writeZipPromise: function(targetFileName, props) {
        const { overwrite, perm } = Object.assign({ overwrite: true }, props);
        return new Promise((resolve, reject) => {
          if (!targetFileName && opts.filename) targetFileName = opts.filename;
          if (!targetFileName) reject("ADM-ZIP: ZIP File Name Missing");
          this.toBufferPromise().then((zipData) => {
            const ret = (done) => done ? resolve(done) : reject("ADM-ZIP: Wasn't able to write zip file");
            filetools.writeFileToAsync(targetFileName, zipData, overwrite, perm, ret);
          }, reject);
        });
      },
      /**
       * @returns {Promise<Buffer>} A promise to the Buffer.
       */
      toBufferPromise: function() {
        return new Promise((resolve, reject) => {
          _zip.toAsyncBuffer(resolve, reject);
        });
      },
      /**
       * Returns the content of the entire zip file as a Buffer object
       *
       * @prop {function} [onSuccess]
       * @prop {function} [onFail]
       * @prop {function} [onItemStart]
       * @prop {function} [onItemEnd]
       * @returns {Buffer}
       */
      toBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
        if (typeof onSuccess === "function") {
          _zip.toAsyncBuffer(onSuccess, onFail, onItemStart, onItemEnd);
          return null;
        }
        return _zip.compressToBuffer();
      }
    };
  };
  return admZip;
}
var admZipExports = requireAdmZip();
const AdmZip = /* @__PURE__ */ getDefaultExportFromCjs(admZipExports);
const proc = typeof process === "object" && process ? process : {
  stdout: null,
  stderr: null
};
const isStream = (s) => !!s && typeof s === "object" && (s instanceof Minipass || s instanceof Stream || isReadable(s) || isWritable(s));
const isReadable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.pipe === "function" && // node core Writable streams have a pipe() method, but it throws
s.pipe !== Stream.Writable.prototype.pipe;
const isWritable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.write === "function" && typeof s.end === "function";
const EOF$1 = Symbol("EOF");
const MAYBE_EMIT_END = Symbol("maybeEmitEnd");
const EMITTED_END = Symbol("emittedEnd");
const EMITTING_END = Symbol("emittingEnd");
const EMITTED_ERROR = Symbol("emittedError");
const CLOSED = Symbol("closed");
const READ$1 = Symbol("read");
const FLUSH = Symbol("flush");
const FLUSHCHUNK = Symbol("flushChunk");
const ENCODING = Symbol("encoding");
const DECODER = Symbol("decoder");
const FLOWING = Symbol("flowing");
const PAUSED = Symbol("paused");
const RESUME = Symbol("resume");
const BUFFER$1 = Symbol("buffer");
const PIPES = Symbol("pipes");
const BUFFERLENGTH = Symbol("bufferLength");
const BUFFERPUSH = Symbol("bufferPush");
const BUFFERSHIFT = Symbol("bufferShift");
const OBJECTMODE = Symbol("objectMode");
const DESTROYED = Symbol("destroyed");
const ERROR = Symbol("error");
const EMITDATA = Symbol("emitData");
const EMITEND = Symbol("emitEnd");
const EMITEND2 = Symbol("emitEnd2");
const ASYNC = Symbol("async");
const ABORT = Symbol("abort");
const ABORTED$1 = Symbol("aborted");
const SIGNAL = Symbol("signal");
const DATALISTENERS = Symbol("dataListeners");
const DISCARDED = Symbol("discarded");
const defer = (fn) => Promise.resolve().then(fn);
const nodefer = (fn) => fn();
const isEndish = (ev) => ev === "end" || ev === "finish" || ev === "prefinish";
const isArrayBufferLike = (b) => b instanceof ArrayBuffer || !!b && typeof b === "object" && b.constructor && b.constructor.name === "ArrayBuffer" && b.byteLength >= 0;
const isArrayBufferView = (b) => !Buffer.isBuffer(b) && ArrayBuffer.isView(b);
class Pipe {
  src;
  dest;
  opts;
  ondrain;
  constructor(src, dest, opts) {
    this.src = src;
    this.dest = dest;
    this.opts = opts;
    this.ondrain = () => src[RESUME]();
    this.dest.on("drain", this.ondrain);
  }
  unpipe() {
    this.dest.removeListener("drain", this.ondrain);
  }
  // only here for the prototype
  /* c8 ignore start */
  proxyErrors(_er) {
  }
  /* c8 ignore stop */
  end() {
    this.unpipe();
    if (this.opts.end)
      this.dest.end();
  }
}
class PipeProxyErrors extends Pipe {
  unpipe() {
    this.src.removeListener("error", this.proxyErrors);
    super.unpipe();
  }
  constructor(src, dest, opts) {
    super(src, dest, opts);
    this.proxyErrors = (er) => dest.emit("error", er);
    src.on("error", this.proxyErrors);
  }
}
const isObjectModeOptions = (o) => !!o.objectMode;
const isEncodingOptions = (o) => !o.objectMode && !!o.encoding && o.encoding !== "buffer";
class Minipass extends EventEmitter {
  [FLOWING] = false;
  [PAUSED] = false;
  [PIPES] = [];
  [BUFFER$1] = [];
  [OBJECTMODE];
  [ENCODING];
  [ASYNC];
  [DECODER];
  [EOF$1] = false;
  [EMITTED_END] = false;
  [EMITTING_END] = false;
  [CLOSED] = false;
  [EMITTED_ERROR] = null;
  [BUFFERLENGTH] = 0;
  [DESTROYED] = false;
  [SIGNAL];
  [ABORTED$1] = false;
  [DATALISTENERS] = 0;
  [DISCARDED] = false;
  /**
   * true if the stream can be written
   */
  writable = true;
  /**
   * true if the stream can be read
   */
  readable = true;
  /**
   * If `RType` is Buffer, then options do not need to be provided.
   * Otherwise, an options object must be provided to specify either
   * {@link Minipass.SharedOptions.objectMode} or
   * {@link Minipass.SharedOptions.encoding}, as appropriate.
   */
  constructor(...args) {
    const options = args[0] || {};
    super();
    if (options.objectMode && typeof options.encoding === "string") {
      throw new TypeError("Encoding and objectMode may not be used together");
    }
    if (isObjectModeOptions(options)) {
      this[OBJECTMODE] = true;
      this[ENCODING] = null;
    } else if (isEncodingOptions(options)) {
      this[ENCODING] = options.encoding;
      this[OBJECTMODE] = false;
    } else {
      this[OBJECTMODE] = false;
      this[ENCODING] = null;
    }
    this[ASYNC] = !!options.async;
    this[DECODER] = this[ENCODING] ? new StringDecoder(this[ENCODING]) : null;
    if (options && options.debugExposeBuffer === true) {
      Object.defineProperty(this, "buffer", { get: () => this[BUFFER$1] });
    }
    if (options && options.debugExposePipes === true) {
      Object.defineProperty(this, "pipes", { get: () => this[PIPES] });
    }
    const { signal } = options;
    if (signal) {
      this[SIGNAL] = signal;
      if (signal.aborted) {
        this[ABORT]();
      } else {
        signal.addEventListener("abort", () => this[ABORT]());
      }
    }
  }
  /**
   * The amount of data stored in the buffer waiting to be read.
   *
   * For Buffer strings, this will be the total byte length.
   * For string encoding streams, this will be the string character length,
   * according to JavaScript's `string.length` logic.
   * For objectMode streams, this is a count of the items waiting to be
   * emitted.
   */
  get bufferLength() {
    return this[BUFFERLENGTH];
  }
  /**
   * The `BufferEncoding` currently in use, or `null`
   */
  get encoding() {
    return this[ENCODING];
  }
  /**
   * @deprecated - This is a read only property
   */
  set encoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  /**
   * @deprecated - Encoding may only be set at instantiation time
   */
  setEncoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  /**
   * True if this is an objectMode stream
   */
  get objectMode() {
    return this[OBJECTMODE];
  }
  /**
   * @deprecated - This is a read-only property
   */
  set objectMode(_om) {
    throw new Error("objectMode must be set at instantiation time");
  }
  /**
   * true if this is an async stream
   */
  get ["async"]() {
    return this[ASYNC];
  }
  /**
   * Set to true to make this stream async.
   *
   * Once set, it cannot be unset, as this would potentially cause incorrect
   * behavior.  Ie, a sync stream can be made async, but an async stream
   * cannot be safely made sync.
   */
  set ["async"](a) {
    this[ASYNC] = this[ASYNC] || !!a;
  }
  // drop everything and get out of the flow completely
  [ABORT]() {
    this[ABORTED$1] = true;
    this.emit("abort", this[SIGNAL]?.reason);
    this.destroy(this[SIGNAL]?.reason);
  }
  /**
   * True if the stream has been aborted.
   */
  get aborted() {
    return this[ABORTED$1];
  }
  /**
   * No-op setter. Stream aborted status is set via the AbortSignal provided
   * in the constructor options.
   */
  set aborted(_) {
  }
  write(chunk, encoding, cb) {
    if (this[ABORTED$1])
      return false;
    if (this[EOF$1])
      throw new Error("write after end");
    if (this[DESTROYED]) {
      this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" }));
      return true;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (!encoding)
      encoding = "utf8";
    const fn = this[ASYNC] ? defer : nodefer;
    if (!this[OBJECTMODE] && !Buffer.isBuffer(chunk)) {
      if (isArrayBufferView(chunk)) {
        chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else if (isArrayBufferLike(chunk)) {
        chunk = Buffer.from(chunk);
      } else if (typeof chunk !== "string") {
        throw new Error("Non-contiguous data written to non-objectMode stream");
      }
    }
    if (this[OBJECTMODE]) {
      if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
        this[FLUSH](true);
      if (this[FLOWING])
        this.emit("data", chunk);
      else
        this[BUFFERPUSH](chunk);
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (!chunk.length) {
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (typeof chunk === "string" && // unless it is a string already ready for us to use
    !(encoding === this[ENCODING] && !this[DECODER]?.lastNeed)) {
      chunk = Buffer.from(chunk, encoding);
    }
    if (Buffer.isBuffer(chunk) && this[ENCODING]) {
      chunk = this[DECODER].write(chunk);
    }
    if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
      this[FLUSH](true);
    if (this[FLOWING])
      this.emit("data", chunk);
    else
      this[BUFFERPUSH](chunk);
    if (this[BUFFERLENGTH] !== 0)
      this.emit("readable");
    if (cb)
      fn(cb);
    return this[FLOWING];
  }
  /**
   * Low-level explicit read method.
   *
   * In objectMode, the argument is ignored, and one item is returned if
   * available.
   *
   * `n` is the number of bytes (or in the case of encoding streams,
   * characters) to consume. If `n` is not provided, then the entire buffer
   * is returned, or `null` is returned if no data is available.
   *
   * If `n` is greater that the amount of data in the internal buffer,
   * then `null` is returned.
   */
  read(n) {
    if (this[DESTROYED])
      return null;
    this[DISCARDED] = false;
    if (this[BUFFERLENGTH] === 0 || n === 0 || n && n > this[BUFFERLENGTH]) {
      this[MAYBE_EMIT_END]();
      return null;
    }
    if (this[OBJECTMODE])
      n = null;
    if (this[BUFFER$1].length > 1 && !this[OBJECTMODE]) {
      this[BUFFER$1] = [
        this[ENCODING] ? this[BUFFER$1].join("") : Buffer.concat(this[BUFFER$1], this[BUFFERLENGTH])
      ];
    }
    const ret = this[READ$1](n || null, this[BUFFER$1][0]);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [READ$1](n, chunk) {
    if (this[OBJECTMODE])
      this[BUFFERSHIFT]();
    else {
      const c = chunk;
      if (n === c.length || n === null)
        this[BUFFERSHIFT]();
      else if (typeof c === "string") {
        this[BUFFER$1][0] = c.slice(n);
        chunk = c.slice(0, n);
        this[BUFFERLENGTH] -= n;
      } else {
        this[BUFFER$1][0] = c.subarray(n);
        chunk = c.subarray(0, n);
        this[BUFFERLENGTH] -= n;
      }
    }
    this.emit("data", chunk);
    if (!this[BUFFER$1].length && !this[EOF$1])
      this.emit("drain");
    return chunk;
  }
  end(chunk, encoding, cb) {
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (chunk !== void 0)
      this.write(chunk, encoding);
    if (cb)
      this.once("end", cb);
    this[EOF$1] = true;
    this.writable = false;
    if (this[FLOWING] || !this[PAUSED])
      this[MAYBE_EMIT_END]();
    return this;
  }
  // don't let the internal resume be overwritten
  [RESUME]() {
    if (this[DESTROYED])
      return;
    if (!this[DATALISTENERS] && !this[PIPES].length) {
      this[DISCARDED] = true;
    }
    this[PAUSED] = false;
    this[FLOWING] = true;
    this.emit("resume");
    if (this[BUFFER$1].length)
      this[FLUSH]();
    else if (this[EOF$1])
      this[MAYBE_EMIT_END]();
    else
      this.emit("drain");
  }
  /**
   * Resume the stream if it is currently in a paused state
   *
   * If called when there are no pipe destinations or `data` event listeners,
   * this will place the stream in a "discarded" state, where all data will
   * be thrown away. The discarded state is removed if a pipe destination or
   * data handler is added, if pause() is called, or if any synchronous or
   * asynchronous iteration is started.
   */
  resume() {
    return this[RESUME]();
  }
  /**
   * Pause the stream
   */
  pause() {
    this[FLOWING] = false;
    this[PAUSED] = true;
    this[DISCARDED] = false;
  }
  /**
   * true if the stream has been forcibly destroyed
   */
  get destroyed() {
    return this[DESTROYED];
  }
  /**
   * true if the stream is currently in a flowing state, meaning that
   * any writes will be immediately emitted.
   */
  get flowing() {
    return this[FLOWING];
  }
  /**
   * true if the stream is currently in a paused state
   */
  get paused() {
    return this[PAUSED];
  }
  [BUFFERPUSH](chunk) {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] += 1;
    else
      this[BUFFERLENGTH] += chunk.length;
    this[BUFFER$1].push(chunk);
  }
  [BUFFERSHIFT]() {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] -= 1;
    else
      this[BUFFERLENGTH] -= this[BUFFER$1][0].length;
    return this[BUFFER$1].shift();
  }
  [FLUSH](noDrain = false) {
    do {
    } while (this[FLUSHCHUNK](this[BUFFERSHIFT]()) && this[BUFFER$1].length);
    if (!noDrain && !this[BUFFER$1].length && !this[EOF$1])
      this.emit("drain");
  }
  [FLUSHCHUNK](chunk) {
    this.emit("data", chunk);
    return this[FLOWING];
  }
  /**
   * Pipe all data emitted by this stream into the destination provided.
   *
   * Triggers the flow of data.
   */
  pipe(dest, opts) {
    if (this[DESTROYED])
      return dest;
    this[DISCARDED] = false;
    const ended = this[EMITTED_END];
    opts = opts || {};
    if (dest === proc.stdout || dest === proc.stderr)
      opts.end = false;
    else
      opts.end = opts.end !== false;
    opts.proxyErrors = !!opts.proxyErrors;
    if (ended) {
      if (opts.end)
        dest.end();
    } else {
      this[PIPES].push(!opts.proxyErrors ? new Pipe(this, dest, opts) : new PipeProxyErrors(this, dest, opts));
      if (this[ASYNC])
        defer(() => this[RESUME]());
      else
        this[RESUME]();
    }
    return dest;
  }
  /**
   * Fully unhook a piped destination stream.
   *
   * If the destination stream was the only consumer of this stream (ie,
   * there are no other piped destinations or `'data'` event listeners)
   * then the flow of data will stop until there is another consumer or
   * {@link Minipass#resume} is explicitly called.
   */
  unpipe(dest) {
    const p = this[PIPES].find((p2) => p2.dest === dest);
    if (p) {
      if (this[PIPES].length === 1) {
        if (this[FLOWING] && this[DATALISTENERS] === 0) {
          this[FLOWING] = false;
        }
        this[PIPES] = [];
      } else
        this[PIPES].splice(this[PIPES].indexOf(p), 1);
      p.unpipe();
    }
  }
  /**
   * Alias for {@link Minipass#on}
   */
  addListener(ev, handler) {
    return this.on(ev, handler);
  }
  /**
   * Mostly identical to `EventEmitter.on`, with the following
   * behavior differences to prevent data loss and unnecessary hangs:
   *
   * - Adding a 'data' event handler will trigger the flow of data
   *
   * - Adding a 'readable' event handler when there is data waiting to be read
   *   will cause 'readable' to be emitted immediately.
   *
   * - Adding an 'endish' event handler ('end', 'finish', etc.) which has
   *   already passed will cause the event to be emitted immediately and all
   *   handlers removed.
   *
   * - Adding an 'error' event handler after an error has been emitted will
   *   cause the event to be re-emitted immediately with the error previously
   *   raised.
   */
  on(ev, handler) {
    const ret = super.on(ev, handler);
    if (ev === "data") {
      this[DISCARDED] = false;
      this[DATALISTENERS]++;
      if (!this[PIPES].length && !this[FLOWING]) {
        this[RESUME]();
      }
    } else if (ev === "readable" && this[BUFFERLENGTH] !== 0) {
      super.emit("readable");
    } else if (isEndish(ev) && this[EMITTED_END]) {
      super.emit(ev);
      this.removeAllListeners(ev);
    } else if (ev === "error" && this[EMITTED_ERROR]) {
      const h = handler;
      if (this[ASYNC])
        defer(() => h.call(this, this[EMITTED_ERROR]));
      else
        h.call(this, this[EMITTED_ERROR]);
    }
    return ret;
  }
  /**
   * Alias for {@link Minipass#off}
   */
  removeListener(ev, handler) {
    return this.off(ev, handler);
  }
  /**
   * Mostly identical to `EventEmitter.off`
   *
   * If a 'data' event handler is removed, and it was the last consumer
   * (ie, there are no pipe destinations or other 'data' event listeners),
   * then the flow of data will stop until there is another consumer or
   * {@link Minipass#resume} is explicitly called.
   */
  off(ev, handler) {
    const ret = super.off(ev, handler);
    if (ev === "data") {
      this[DATALISTENERS] = this.listeners("data").length;
      if (this[DATALISTENERS] === 0 && !this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  /**
   * Mostly identical to `EventEmitter.removeAllListeners`
   *
   * If all 'data' event handlers are removed, and they were the last consumer
   * (ie, there are no pipe destinations), then the flow of data will stop
   * until there is another consumer or {@link Minipass#resume} is explicitly
   * called.
   */
  removeAllListeners(ev) {
    const ret = super.removeAllListeners(ev);
    if (ev === "data" || ev === void 0) {
      this[DATALISTENERS] = 0;
      if (!this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  /**
   * true if the 'end' event has been emitted
   */
  get emittedEnd() {
    return this[EMITTED_END];
  }
  [MAYBE_EMIT_END]() {
    if (!this[EMITTING_END] && !this[EMITTED_END] && !this[DESTROYED] && this[BUFFER$1].length === 0 && this[EOF$1]) {
      this[EMITTING_END] = true;
      this.emit("end");
      this.emit("prefinish");
      this.emit("finish");
      if (this[CLOSED])
        this.emit("close");
      this[EMITTING_END] = false;
    }
  }
  /**
   * Mostly identical to `EventEmitter.emit`, with the following
   * behavior differences to prevent data loss and unnecessary hangs:
   *
   * If the stream has been destroyed, and the event is something other
   * than 'close' or 'error', then `false` is returned and no handlers
   * are called.
   *
   * If the event is 'end', and has already been emitted, then the event
   * is ignored. If the stream is in a paused or non-flowing state, then
   * the event will be deferred until data flow resumes. If the stream is
   * async, then handlers will be called on the next tick rather than
   * immediately.
   *
   * If the event is 'close', and 'end' has not yet been emitted, then
   * the event will be deferred until after 'end' is emitted.
   *
   * If the event is 'error', and an AbortSignal was provided for the stream,
   * and there are no listeners, then the event is ignored, matching the
   * behavior of node core streams in the presense of an AbortSignal.
   *
   * If the event is 'finish' or 'prefinish', then all listeners will be
   * removed after emitting the event, to prevent double-firing.
   */
  emit(ev, ...args) {
    const data = args[0];
    if (ev !== "error" && ev !== "close" && ev !== DESTROYED && this[DESTROYED]) {
      return false;
    } else if (ev === "data") {
      return !this[OBJECTMODE] && !data ? false : this[ASYNC] ? (defer(() => this[EMITDATA](data)), true) : this[EMITDATA](data);
    } else if (ev === "end") {
      return this[EMITEND]();
    } else if (ev === "close") {
      this[CLOSED] = true;
      if (!this[EMITTED_END] && !this[DESTROYED])
        return false;
      const ret2 = super.emit("close");
      this.removeAllListeners("close");
      return ret2;
    } else if (ev === "error") {
      this[EMITTED_ERROR] = data;
      super.emit(ERROR, data);
      const ret2 = !this[SIGNAL] || this.listeners("error").length ? super.emit("error", data) : false;
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "resume") {
      const ret2 = super.emit("resume");
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "finish" || ev === "prefinish") {
      const ret2 = super.emit(ev);
      this.removeAllListeners(ev);
      return ret2;
    }
    const ret = super.emit(ev, ...args);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITDATA](data) {
    for (const p of this[PIPES]) {
      if (p.dest.write(data) === false)
        this.pause();
    }
    const ret = this[DISCARDED] ? false : super.emit("data", data);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITEND]() {
    if (this[EMITTED_END])
      return false;
    this[EMITTED_END] = true;
    this.readable = false;
    return this[ASYNC] ? (defer(() => this[EMITEND2]()), true) : this[EMITEND2]();
  }
  [EMITEND2]() {
    if (this[DECODER]) {
      const data = this[DECODER].end();
      if (data) {
        for (const p of this[PIPES]) {
          p.dest.write(data);
        }
        if (!this[DISCARDED])
          super.emit("data", data);
      }
    }
    for (const p of this[PIPES]) {
      p.end();
    }
    const ret = super.emit("end");
    this.removeAllListeners("end");
    return ret;
  }
  /**
   * Return a Promise that resolves to an array of all emitted data once
   * the stream ends.
   */
  async collect() {
    const buf = Object.assign([], {
      dataLength: 0
    });
    if (!this[OBJECTMODE])
      buf.dataLength = 0;
    const p = this.promise();
    this.on("data", (c) => {
      buf.push(c);
      if (!this[OBJECTMODE])
        buf.dataLength += c.length;
    });
    await p;
    return buf;
  }
  /**
   * Return a Promise that resolves to the concatenation of all emitted data
   * once the stream ends.
   *
   * Not allowed on objectMode streams.
   */
  async concat() {
    if (this[OBJECTMODE]) {
      throw new Error("cannot concat in objectMode");
    }
    const buf = await this.collect();
    return this[ENCODING] ? buf.join("") : Buffer.concat(buf, buf.dataLength);
  }
  /**
   * Return a void Promise that resolves once the stream ends.
   */
  async promise() {
    return new Promise((resolve, reject) => {
      this.on(DESTROYED, () => reject(new Error("stream destroyed")));
      this.on("error", (er) => reject(er));
      this.on("end", () => resolve());
    });
  }
  /**
   * Asynchronous `for await of` iteration.
   *
   * This will continue emitting all chunks until the stream terminates.
   */
  [Symbol.asyncIterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = async () => {
      this.pause();
      stopped = true;
      return { value: void 0, done: true };
    };
    const next = () => {
      if (stopped)
        return stop();
      const res = this.read();
      if (res !== null)
        return Promise.resolve({ done: false, value: res });
      if (this[EOF$1])
        return stop();
      let resolve;
      let reject;
      const onerr = (er) => {
        this.off("data", ondata);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        stop();
        reject(er);
      };
      const ondata = (value) => {
        this.off("error", onerr);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        this.pause();
        resolve({ value, done: !!this[EOF$1] });
      };
      const onend = () => {
        this.off("error", onerr);
        this.off("data", ondata);
        this.off(DESTROYED, ondestroy);
        stop();
        resolve({ done: true, value: void 0 });
      };
      const ondestroy = () => onerr(new Error("stream destroyed"));
      return new Promise((res2, rej) => {
        reject = rej;
        resolve = res2;
        this.once(DESTROYED, ondestroy);
        this.once("error", onerr);
        this.once("end", onend);
        this.once("data", ondata);
      });
    };
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
  /**
   * Synchronous `for of` iteration.
   *
   * The iteration will terminate when the internal buffer runs out, even
   * if the stream has not yet terminated.
   */
  [Symbol.iterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = () => {
      this.pause();
      this.off(ERROR, stop);
      this.off(DESTROYED, stop);
      this.off("end", stop);
      stopped = true;
      return { done: true, value: void 0 };
    };
    const next = () => {
      if (stopped)
        return stop();
      const value = this.read();
      return value === null ? stop() : { done: false, value };
    };
    this.once("end", stop);
    this.once(ERROR, stop);
    this.once(DESTROYED, stop);
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.iterator]() {
        return this;
      }
    };
  }
  /**
   * Destroy a stream, preventing it from being used for any further purpose.
   *
   * If the stream has a `close()` method, then it will be called on
   * destruction.
   *
   * After destruction, any attempt to write data, read data, or emit most
   * events will be ignored.
   *
   * If an error argument is provided, then it will be emitted in an
   * 'error' event.
   */
  destroy(er) {
    if (this[DESTROYED]) {
      if (er)
        this.emit("error", er);
      else
        this.emit(DESTROYED);
      return this;
    }
    this[DESTROYED] = true;
    this[DISCARDED] = true;
    this[BUFFER$1].length = 0;
    this[BUFFERLENGTH] = 0;
    const wc = this;
    if (typeof wc.close === "function" && !this[CLOSED])
      wc.close();
    if (er)
      this.emit("error", er);
    else
      this.emit(DESTROYED);
    return this;
  }
  /**
   * Alias for {@link isStream}
   *
   * Former export location, maintained for backwards compatibility.
   *
   * @deprecated
   */
  static get isStream() {
    return isStream;
  }
}
const writev = fs.writev;
const _autoClose = Symbol("_autoClose");
const _close = Symbol("_close");
const _ended = Symbol("_ended");
const _fd = Symbol("_fd");
const _finished = Symbol("_finished");
const _flags = Symbol("_flags");
const _flush = Symbol("_flush");
const _handleChunk = Symbol("_handleChunk");
const _makeBuf = Symbol("_makeBuf");
const _mode = Symbol("_mode");
const _needDrain = Symbol("_needDrain");
const _onerror = Symbol("_onerror");
const _onopen = Symbol("_onopen");
const _onread = Symbol("_onread");
const _onwrite = Symbol("_onwrite");
const _open = Symbol("_open");
const _path = Symbol("_path");
const _pos = Symbol("_pos");
const _queue = Symbol("_queue");
const _read = Symbol("_read");
const _readSize = Symbol("_readSize");
const _reading = Symbol("_reading");
const _remain = Symbol("_remain");
const _size = Symbol("_size");
const _write = Symbol("_write");
const _writing = Symbol("_writing");
const _defaultFlag = Symbol("_defaultFlag");
const _errored = Symbol("_errored");
class ReadStream extends Minipass {
  [_errored] = false;
  [_fd];
  [_path];
  [_readSize];
  [_reading] = false;
  [_size];
  [_remain];
  [_autoClose];
  constructor(path2, opt) {
    opt = opt || {};
    super(opt);
    this.readable = true;
    this.writable = false;
    if (typeof path2 !== "string") {
      throw new TypeError("path must be a string");
    }
    this[_errored] = false;
    this[_fd] = typeof opt.fd === "number" ? opt.fd : void 0;
    this[_path] = path2;
    this[_readSize] = opt.readSize || 16 * 1024 * 1024;
    this[_reading] = false;
    this[_size] = typeof opt.size === "number" ? opt.size : Infinity;
    this[_remain] = this[_size];
    this[_autoClose] = typeof opt.autoClose === "boolean" ? opt.autoClose : true;
    if (typeof this[_fd] === "number") {
      this[_read]();
    } else {
      this[_open]();
    }
  }
  get fd() {
    return this[_fd];
  }
  get path() {
    return this[_path];
  }
  //@ts-ignore
  write() {
    throw new TypeError("this is a readable stream");
  }
  //@ts-ignore
  end() {
    throw new TypeError("this is a readable stream");
  }
  [_open]() {
    fs.open(this[_path], "r", (er, fd) => this[_onopen](er, fd));
  }
  [_onopen](er, fd) {
    if (er) {
      this[_onerror](er);
    } else {
      this[_fd] = fd;
      this.emit("open", fd);
      this[_read]();
    }
  }
  [_makeBuf]() {
    return Buffer.allocUnsafe(Math.min(this[_readSize], this[_remain]));
  }
  [_read]() {
    if (!this[_reading]) {
      this[_reading] = true;
      const buf = this[_makeBuf]();
      if (buf.length === 0) {
        return process.nextTick(() => this[_onread](null, 0, buf));
      }
      fs.read(this[_fd], buf, 0, buf.length, null, (er, br, b) => this[_onread](er, br, b));
    }
  }
  [_onread](er, br, buf) {
    this[_reading] = false;
    if (er) {
      this[_onerror](er);
    } else if (this[_handleChunk](br, buf)) {
      this[_read]();
    }
  }
  [_close]() {
    if (this[_autoClose] && typeof this[_fd] === "number") {
      const fd = this[_fd];
      this[_fd] = void 0;
      fs.close(fd, (er) => er ? this.emit("error", er) : this.emit("close"));
    }
  }
  [_onerror](er) {
    this[_reading] = true;
    this[_close]();
    this.emit("error", er);
  }
  [_handleChunk](br, buf) {
    let ret = false;
    this[_remain] -= br;
    if (br > 0) {
      ret = super.write(br < buf.length ? buf.subarray(0, br) : buf);
    }
    if (br === 0 || this[_remain] <= 0) {
      ret = false;
      this[_close]();
      super.end();
    }
    return ret;
  }
  emit(ev, ...args) {
    switch (ev) {
      case "prefinish":
      case "finish":
        return false;
      case "drain":
        if (typeof this[_fd] === "number") {
          this[_read]();
        }
        return false;
      case "error":
        if (this[_errored]) {
          return false;
        }
        this[_errored] = true;
        return super.emit(ev, ...args);
      default:
        return super.emit(ev, ...args);
    }
  }
}
class ReadStreamSync extends ReadStream {
  [_open]() {
    let threw = true;
    try {
      this[_onopen](null, fs.openSync(this[_path], "r"));
      threw = false;
    } finally {
      if (threw) {
        this[_close]();
      }
    }
  }
  [_read]() {
    let threw = true;
    try {
      if (!this[_reading]) {
        this[_reading] = true;
        do {
          const buf = this[_makeBuf]();
          const br = buf.length === 0 ? 0 : fs.readSync(this[_fd], buf, 0, buf.length, null);
          if (!this[_handleChunk](br, buf)) {
            break;
          }
        } while (true);
        this[_reading] = false;
      }
      threw = false;
    } finally {
      if (threw) {
        this[_close]();
      }
    }
  }
  [_close]() {
    if (this[_autoClose] && typeof this[_fd] === "number") {
      const fd = this[_fd];
      this[_fd] = void 0;
      fs.closeSync(fd);
      this.emit("close");
    }
  }
}
class WriteStream extends EE {
  readable = false;
  writable = true;
  [_errored] = false;
  [_writing] = false;
  [_ended] = false;
  [_queue] = [];
  [_needDrain] = false;
  [_path];
  [_mode];
  [_autoClose];
  [_fd];
  [_defaultFlag];
  [_flags];
  [_finished] = false;
  [_pos];
  constructor(path2, opt) {
    opt = opt || {};
    super(opt);
    this[_path] = path2;
    this[_fd] = typeof opt.fd === "number" ? opt.fd : void 0;
    this[_mode] = opt.mode === void 0 ? 438 : opt.mode;
    this[_pos] = typeof opt.start === "number" ? opt.start : void 0;
    this[_autoClose] = typeof opt.autoClose === "boolean" ? opt.autoClose : true;
    const defaultFlag = this[_pos] !== void 0 ? "r+" : "w";
    this[_defaultFlag] = opt.flags === void 0;
    this[_flags] = opt.flags === void 0 ? defaultFlag : opt.flags;
    if (this[_fd] === void 0) {
      this[_open]();
    }
  }
  emit(ev, ...args) {
    if (ev === "error") {
      if (this[_errored]) {
        return false;
      }
      this[_errored] = true;
    }
    return super.emit(ev, ...args);
  }
  get fd() {
    return this[_fd];
  }
  get path() {
    return this[_path];
  }
  [_onerror](er) {
    this[_close]();
    this[_writing] = true;
    this.emit("error", er);
  }
  [_open]() {
    fs.open(this[_path], this[_flags], this[_mode], (er, fd) => this[_onopen](er, fd));
  }
  [_onopen](er, fd) {
    if (this[_defaultFlag] && this[_flags] === "r+" && er && er.code === "ENOENT") {
      this[_flags] = "w";
      this[_open]();
    } else if (er) {
      this[_onerror](er);
    } else {
      this[_fd] = fd;
      this.emit("open", fd);
      if (!this[_writing]) {
        this[_flush]();
      }
    }
  }
  end(buf, enc) {
    if (buf) {
      this.write(buf, enc);
    }
    this[_ended] = true;
    if (!this[_writing] && !this[_queue].length && typeof this[_fd] === "number") {
      this[_onwrite](null, 0);
    }
    return this;
  }
  write(buf, enc) {
    if (typeof buf === "string") {
      buf = Buffer.from(buf, enc);
    }
    if (this[_ended]) {
      this.emit("error", new Error("write() after end()"));
      return false;
    }
    if (this[_fd] === void 0 || this[_writing] || this[_queue].length) {
      this[_queue].push(buf);
      this[_needDrain] = true;
      return false;
    }
    this[_writing] = true;
    this[_write](buf);
    return true;
  }
  [_write](buf) {
    fs.write(this[_fd], buf, 0, buf.length, this[_pos], (er, bw) => this[_onwrite](er, bw));
  }
  [_onwrite](er, bw) {
    if (er) {
      this[_onerror](er);
    } else {
      if (this[_pos] !== void 0 && typeof bw === "number") {
        this[_pos] += bw;
      }
      if (this[_queue].length) {
        this[_flush]();
      } else {
        this[_writing] = false;
        if (this[_ended] && !this[_finished]) {
          this[_finished] = true;
          this[_close]();
          this.emit("finish");
        } else if (this[_needDrain]) {
          this[_needDrain] = false;
          this.emit("drain");
        }
      }
    }
  }
  [_flush]() {
    if (this[_queue].length === 0) {
      if (this[_ended]) {
        this[_onwrite](null, 0);
      }
    } else if (this[_queue].length === 1) {
      this[_write](this[_queue].pop());
    } else {
      const iovec = this[_queue];
      this[_queue] = [];
      writev(this[_fd], iovec, this[_pos], (er, bw) => this[_onwrite](er, bw));
    }
  }
  [_close]() {
    if (this[_autoClose] && typeof this[_fd] === "number") {
      const fd = this[_fd];
      this[_fd] = void 0;
      fs.close(fd, (er) => er ? this.emit("error", er) : this.emit("close"));
    }
  }
}
class WriteStreamSync extends WriteStream {
  [_open]() {
    let fd;
    if (this[_defaultFlag] && this[_flags] === "r+") {
      try {
        fd = fs.openSync(this[_path], this[_flags], this[_mode]);
      } catch (er) {
        if (er?.code === "ENOENT") {
          this[_flags] = "w";
          return this[_open]();
        } else {
          throw er;
        }
      }
    } else {
      fd = fs.openSync(this[_path], this[_flags], this[_mode]);
    }
    this[_onopen](null, fd);
  }
  [_close]() {
    if (this[_autoClose] && typeof this[_fd] === "number") {
      const fd = this[_fd];
      this[_fd] = void 0;
      fs.closeSync(fd);
      this.emit("close");
    }
  }
  [_write](buf) {
    let threw = true;
    try {
      this[_onwrite](null, fs.writeSync(this[_fd], buf, 0, buf.length, this[_pos]));
      threw = false;
    } finally {
      if (threw) {
        try {
          this[_close]();
        } catch {
        }
      }
    }
  }
}
const argmap = /* @__PURE__ */ new Map([
  ["C", "cwd"],
  ["f", "file"],
  ["z", "gzip"],
  ["P", "preservePaths"],
  ["U", "unlink"],
  ["strip-components", "strip"],
  ["stripComponents", "strip"],
  ["keep-newer", "newer"],
  ["keepNewer", "newer"],
  ["keep-newer-files", "newer"],
  ["keepNewerFiles", "newer"],
  ["k", "keep"],
  ["keep-existing", "keep"],
  ["keepExisting", "keep"],
  ["m", "noMtime"],
  ["no-mtime", "noMtime"],
  ["p", "preserveOwner"],
  ["L", "follow"],
  ["h", "follow"],
  ["onentry", "onReadEntry"]
]);
const isSyncFile = (o) => !!o.sync && !!o.file;
const isAsyncFile = (o) => !o.sync && !!o.file;
const isSyncNoFile = (o) => !!o.sync && !o.file;
const isAsyncNoFile = (o) => !o.sync && !o.file;
const isFile = (o) => !!o.file;
const dealiasKey = (k) => {
  const d = argmap.get(k);
  if (d)
    return d;
  return k;
};
const dealias = (opt = {}) => {
  if (!opt)
    return {};
  const result = {};
  for (const [key, v] of Object.entries(opt)) {
    const k = dealiasKey(key);
    result[k] = v;
  }
  if (result.chmod === void 0 && result.noChmod === false) {
    result.chmod = true;
  }
  delete result.noChmod;
  return result;
};
const makeCommand = (syncFile, asyncFile, syncNoFile, asyncNoFile, validate) => {
  return Object.assign((opt_ = [], entries, cb) => {
    if (Array.isArray(opt_)) {
      entries = opt_;
      opt_ = {};
    }
    if (typeof entries === "function") {
      cb = entries;
      entries = void 0;
    }
    if (!entries) {
      entries = [];
    } else {
      entries = Array.from(entries);
    }
    const opt = dealias(opt_);
    validate?.(opt, entries);
    if (isSyncFile(opt)) {
      if (typeof cb === "function") {
        throw new TypeError("callback not supported for sync tar functions");
      }
      return syncFile(opt, entries);
    } else if (isAsyncFile(opt)) {
      const p = asyncFile(opt, entries);
      const c = cb ? cb : void 0;
      return c ? p.then(() => c(), c) : p;
    } else if (isSyncNoFile(opt)) {
      if (typeof cb === "function") {
        throw new TypeError("callback not supported for sync tar functions");
      }
      return syncNoFile(opt, entries);
    } else if (isAsyncNoFile(opt)) {
      if (typeof cb === "function") {
        throw new TypeError("callback only supported with file option");
      }
      return asyncNoFile(opt, entries);
    } else {
      throw new Error("impossible options??");
    }
  }, {
    syncFile,
    asyncFile,
    syncNoFile,
    asyncNoFile,
    validate
  });
};
const realZlibConstants = realZlib__default.constants || { ZLIB_VERNUM: 4736 };
const constants = Object.freeze(Object.assign(/* @__PURE__ */ Object.create(null), {
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  Z_MEM_ERROR: -4,
  Z_BUF_ERROR: -5,
  Z_VERSION_ERROR: -6,
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  DEFLATE: 1,
  INFLATE: 2,
  GZIP: 3,
  GUNZIP: 4,
  DEFLATERAW: 5,
  INFLATERAW: 6,
  UNZIP: 7,
  BROTLI_DECODE: 8,
  BROTLI_ENCODE: 9,
  Z_MIN_WINDOWBITS: 8,
  Z_MAX_WINDOWBITS: 15,
  Z_DEFAULT_WINDOWBITS: 15,
  Z_MIN_CHUNK: 64,
  Z_MAX_CHUNK: Infinity,
  Z_DEFAULT_CHUNK: 16384,
  Z_MIN_MEMLEVEL: 1,
  Z_MAX_MEMLEVEL: 9,
  Z_DEFAULT_MEMLEVEL: 8,
  Z_MIN_LEVEL: -1,
  Z_MAX_LEVEL: 9,
  Z_DEFAULT_LEVEL: -1,
  BROTLI_OPERATION_PROCESS: 0,
  BROTLI_OPERATION_FLUSH: 1,
  BROTLI_OPERATION_FINISH: 2,
  BROTLI_OPERATION_EMIT_METADATA: 3,
  BROTLI_MODE_GENERIC: 0,
  BROTLI_MODE_TEXT: 1,
  BROTLI_MODE_FONT: 2,
  BROTLI_DEFAULT_MODE: 0,
  BROTLI_MIN_QUALITY: 0,
  BROTLI_MAX_QUALITY: 11,
  BROTLI_DEFAULT_QUALITY: 11,
  BROTLI_MIN_WINDOW_BITS: 10,
  BROTLI_MAX_WINDOW_BITS: 24,
  BROTLI_LARGE_MAX_WINDOW_BITS: 30,
  BROTLI_DEFAULT_WINDOW: 22,
  BROTLI_MIN_INPUT_BLOCK_BITS: 16,
  BROTLI_MAX_INPUT_BLOCK_BITS: 24,
  BROTLI_PARAM_MODE: 0,
  BROTLI_PARAM_QUALITY: 1,
  BROTLI_PARAM_LGWIN: 2,
  BROTLI_PARAM_LGBLOCK: 3,
  BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4,
  BROTLI_PARAM_SIZE_HINT: 5,
  BROTLI_PARAM_LARGE_WINDOW: 6,
  BROTLI_PARAM_NPOSTFIX: 7,
  BROTLI_PARAM_NDIRECT: 8,
  BROTLI_DECODER_RESULT_ERROR: 0,
  BROTLI_DECODER_RESULT_SUCCESS: 1,
  BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: 2,
  BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: 3,
  BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0,
  BROTLI_DECODER_PARAM_LARGE_WINDOW: 1,
  BROTLI_DECODER_NO_ERROR: 0,
  BROTLI_DECODER_SUCCESS: 1,
  BROTLI_DECODER_NEEDS_MORE_INPUT: 2,
  BROTLI_DECODER_NEEDS_MORE_OUTPUT: 3,
  BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE: -1,
  BROTLI_DECODER_ERROR_FORMAT_RESERVED: -2,
  BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE: -3,
  BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET: -4,
  BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME: -5,
  BROTLI_DECODER_ERROR_FORMAT_CL_SPACE: -6,
  BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE: -7,
  BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT: -8,
  BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1: -9,
  BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2: -10,
  BROTLI_DECODER_ERROR_FORMAT_TRANSFORM: -11,
  BROTLI_DECODER_ERROR_FORMAT_DICTIONARY: -12,
  BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS: -13,
  BROTLI_DECODER_ERROR_FORMAT_PADDING_1: -14,
  BROTLI_DECODER_ERROR_FORMAT_PADDING_2: -15,
  BROTLI_DECODER_ERROR_FORMAT_DISTANCE: -16,
  BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET: -19,
  BROTLI_DECODER_ERROR_INVALID_ARGUMENTS: -20,
  BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES: -21,
  BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS: -22,
  BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP: -25,
  BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1: -26,
  BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2: -27,
  BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES: -30,
  BROTLI_DECODER_ERROR_UNREACHABLE: -31
}, realZlibConstants));
const OriginalBufferConcat = Buffer$1.concat;
const desc = Object.getOwnPropertyDescriptor(Buffer$1, "concat");
const noop$1 = (args) => args;
const passthroughBufferConcat = desc?.writable === true || desc?.set !== void 0 ? (makeNoOp) => {
  Buffer$1.concat = makeNoOp ? noop$1 : OriginalBufferConcat;
} : (_) => {
};
const _superWrite = Symbol("_superWrite");
class ZlibError extends Error {
  code;
  errno;
  constructor(err, origin) {
    super("zlib: " + err.message, { cause: err });
    this.code = err.code;
    this.errno = err.errno;
    if (!this.code)
      this.code = "ZLIB_ERROR";
    this.message = "zlib: " + err.message;
    Error.captureStackTrace(this, origin ?? this.constructor);
  }
  get name() {
    return "ZlibError";
  }
}
const _flushFlag = Symbol("flushFlag");
class ZlibBase extends Minipass {
  #sawError = false;
  #ended = false;
  #flushFlag;
  #finishFlushFlag;
  #fullFlushFlag;
  #handle;
  #onError;
  get sawError() {
    return this.#sawError;
  }
  get handle() {
    return this.#handle;
  }
  /* c8 ignore start */
  get flushFlag() {
    return this.#flushFlag;
  }
  /* c8 ignore stop */
  constructor(opts, mode) {
    if (!opts || typeof opts !== "object")
      throw new TypeError("invalid options for ZlibBase constructor");
    super(opts);
    this.#flushFlag = opts.flush ?? 0;
    this.#finishFlushFlag = opts.finishFlush ?? 0;
    this.#fullFlushFlag = opts.fullFlushFlag ?? 0;
    if (typeof realZlib[mode] !== "function") {
      throw new TypeError("Compression method not supported: " + mode);
    }
    try {
      this.#handle = new realZlib[mode](opts);
    } catch (er) {
      throw new ZlibError(er, this.constructor);
    }
    this.#onError = (err) => {
      if (this.#sawError)
        return;
      this.#sawError = true;
      this.close();
      this.emit("error", err);
    };
    this.#handle?.on("error", (er) => this.#onError(new ZlibError(er)));
    this.once("end", () => this.close);
  }
  close() {
    if (this.#handle) {
      this.#handle.close();
      this.#handle = void 0;
      this.emit("close");
    }
  }
  reset() {
    if (!this.#sawError) {
      assert(this.#handle, "zlib binding closed");
      return this.#handle.reset?.();
    }
  }
  flush(flushFlag) {
    if (this.ended)
      return;
    if (typeof flushFlag !== "number")
      flushFlag = this.#fullFlushFlag;
    this.write(Object.assign(Buffer$1.alloc(0), { [_flushFlag]: flushFlag }));
  }
  end(chunk, encoding, cb) {
    if (typeof chunk === "function") {
      cb = chunk;
      encoding = void 0;
      chunk = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (chunk) {
      if (encoding)
        this.write(chunk, encoding);
      else
        this.write(chunk);
    }
    this.flush(this.#finishFlushFlag);
    this.#ended = true;
    return super.end(cb);
  }
  get ended() {
    return this.#ended;
  }
  // overridden in the gzip classes to do portable writes
  [_superWrite](data) {
    return super.write(data);
  }
  write(chunk, encoding, cb) {
    if (typeof encoding === "function")
      cb = encoding, encoding = "utf8";
    if (typeof chunk === "string")
      chunk = Buffer$1.from(chunk, encoding);
    if (this.#sawError)
      return;
    assert(this.#handle, "zlib binding closed");
    const nativeHandle = this.#handle._handle;
    const originalNativeClose = nativeHandle.close;
    nativeHandle.close = () => {
    };
    const originalClose = this.#handle.close;
    this.#handle.close = () => {
    };
    passthroughBufferConcat(true);
    let result = void 0;
    try {
      const flushFlag = typeof chunk[_flushFlag] === "number" ? chunk[_flushFlag] : this.#flushFlag;
      result = this.#handle._processChunk(chunk, flushFlag);
      passthroughBufferConcat(false);
    } catch (err) {
      passthroughBufferConcat(false);
      this.#onError(new ZlibError(err, this.write));
    } finally {
      if (this.#handle) {
        this.#handle._handle = nativeHandle;
        nativeHandle.close = originalNativeClose;
        this.#handle.close = originalClose;
        this.#handle.removeAllListeners("error");
      }
    }
    if (this.#handle)
      this.#handle.on("error", (er) => this.#onError(new ZlibError(er, this.write)));
    let writeReturn;
    if (result) {
      if (Array.isArray(result) && result.length > 0) {
        const r = result[0];
        writeReturn = this[_superWrite](Buffer$1.from(r));
        for (let i = 1; i < result.length; i++) {
          writeReturn = this[_superWrite](result[i]);
        }
      } else {
        writeReturn = this[_superWrite](Buffer$1.from(result));
      }
    }
    if (cb)
      cb();
    return writeReturn;
  }
}
class Zlib extends ZlibBase {
  #level;
  #strategy;
  constructor(opts, mode) {
    opts = opts || {};
    opts.flush = opts.flush || constants.Z_NO_FLUSH;
    opts.finishFlush = opts.finishFlush || constants.Z_FINISH;
    opts.fullFlushFlag = constants.Z_FULL_FLUSH;
    super(opts, mode);
    this.#level = opts.level;
    this.#strategy = opts.strategy;
  }
  params(level, strategy) {
    if (this.sawError)
      return;
    if (!this.handle)
      throw new Error("cannot switch params when binding is closed");
    if (!this.handle.params)
      throw new Error("not supported in this implementation");
    if (this.#level !== level || this.#strategy !== strategy) {
      this.flush(constants.Z_SYNC_FLUSH);
      assert(this.handle, "zlib binding closed");
      const origFlush = this.handle.flush;
      this.handle.flush = (flushFlag, cb) => {
        if (typeof flushFlag === "function") {
          cb = flushFlag;
          flushFlag = this.flushFlag;
        }
        this.flush(flushFlag);
        cb?.();
      };
      try {
        ;
        this.handle.params(level, strategy);
      } finally {
        this.handle.flush = origFlush;
      }
      if (this.handle) {
        this.#level = level;
        this.#strategy = strategy;
      }
    }
  }
}
class Gzip extends Zlib {
  #portable;
  constructor(opts) {
    super(opts, "Gzip");
    this.#portable = opts && !!opts.portable;
  }
  [_superWrite](data) {
    if (!this.#portable)
      return super[_superWrite](data);
    this.#portable = false;
    data[9] = 255;
    return super[_superWrite](data);
  }
}
class Unzip extends Zlib {
  constructor(opts) {
    super(opts, "Unzip");
  }
}
class Brotli extends ZlibBase {
  constructor(opts, mode) {
    opts = opts || {};
    opts.flush = opts.flush || constants.BROTLI_OPERATION_PROCESS;
    opts.finishFlush = opts.finishFlush || constants.BROTLI_OPERATION_FINISH;
    opts.fullFlushFlag = constants.BROTLI_OPERATION_FLUSH;
    super(opts, mode);
  }
}
class BrotliCompress extends Brotli {
  constructor(opts) {
    super(opts, "BrotliCompress");
  }
}
class BrotliDecompress extends Brotli {
  constructor(opts) {
    super(opts, "BrotliDecompress");
  }
}
class Zstd extends ZlibBase {
  constructor(opts, mode) {
    opts = opts || {};
    opts.flush = opts.flush || constants.ZSTD_e_continue;
    opts.finishFlush = opts.finishFlush || constants.ZSTD_e_end;
    opts.fullFlushFlag = constants.ZSTD_e_flush;
    super(opts, mode);
  }
}
class ZstdCompress extends Zstd {
  constructor(opts) {
    super(opts, "ZstdCompress");
  }
}
class ZstdDecompress extends Zstd {
  constructor(opts) {
    super(opts, "ZstdDecompress");
  }
}
const encode$1 = (num, buf) => {
  if (!Number.isSafeInteger(num)) {
    throw Error("cannot encode number outside of javascript safe integer range");
  } else if (num < 0) {
    encodeNegative(num, buf);
  } else {
    encodePositive(num, buf);
  }
  return buf;
};
const encodePositive = (num, buf) => {
  buf[0] = 128;
  for (var i = buf.length; i > 1; i--) {
    buf[i - 1] = num & 255;
    num = Math.floor(num / 256);
  }
};
const encodeNegative = (num, buf) => {
  buf[0] = 255;
  var flipped = false;
  num = num * -1;
  for (var i = buf.length; i > 1; i--) {
    var byte = num & 255;
    num = Math.floor(num / 256);
    if (flipped) {
      buf[i - 1] = onesComp(byte);
    } else if (byte === 0) {
      buf[i - 1] = 0;
    } else {
      flipped = true;
      buf[i - 1] = twosComp(byte);
    }
  }
};
const parse$1 = (buf) => {
  const pre = buf[0];
  const value = pre === 128 ? pos(buf.subarray(1, buf.length)) : pre === 255 ? twos(buf) : null;
  if (value === null) {
    throw Error("invalid base256 encoding");
  }
  if (!Number.isSafeInteger(value)) {
    throw Error("parsed number outside of javascript safe integer range");
  }
  return value;
};
const twos = (buf) => {
  var len = buf.length;
  var sum = 0;
  var flipped = false;
  for (var i = len - 1; i > -1; i--) {
    var byte = Number(buf[i]);
    var f;
    if (flipped) {
      f = onesComp(byte);
    } else if (byte === 0) {
      f = byte;
    } else {
      flipped = true;
      f = twosComp(byte);
    }
    if (f !== 0) {
      sum -= f * Math.pow(256, len - i - 1);
    }
  }
  return sum;
};
const pos = (buf) => {
  var len = buf.length;
  var sum = 0;
  for (var i = len - 1; i > -1; i--) {
    var byte = Number(buf[i]);
    if (byte !== 0) {
      sum += byte * Math.pow(256, len - i - 1);
    }
  }
  return sum;
};
const onesComp = (byte) => (255 ^ byte) & 255;
const twosComp = (byte) => (255 ^ byte) + 1 & 255;
const isCode = (c) => name.has(c);
const name = /* @__PURE__ */ new Map([
  ["0", "File"],
  // same as File
  ["", "OldFile"],
  ["1", "Link"],
  ["2", "SymbolicLink"],
  // Devices and FIFOs aren't fully supported
  // they are parsed, but skipped when unpacking
  ["3", "CharacterDevice"],
  ["4", "BlockDevice"],
  ["5", "Directory"],
  ["6", "FIFO"],
  // same as File
  ["7", "ContiguousFile"],
  // pax headers
  ["g", "GlobalExtendedHeader"],
  ["x", "ExtendedHeader"],
  // vendor-specific stuff
  // skip
  ["A", "SolarisACL"],
  // like 5, but with data, which should be skipped
  ["D", "GNUDumpDir"],
  // metadata only, skip
  ["I", "Inode"],
  // data = link path of next file
  ["K", "NextFileHasLongLinkpath"],
  // data = path of next file
  ["L", "NextFileHasLongPath"],
  // skip
  ["M", "ContinuationFile"],
  // like L
  ["N", "OldGnuLongPath"],
  // skip
  ["S", "SparseFile"],
  // skip
  ["V", "TapeVolumeHeader"],
  // like x
  ["X", "OldExtendedHeader"]
]);
const code = new Map(Array.from(name).map((kv) => [kv[1], kv[0]]));
class Header {
  cksumValid = false;
  needPax = false;
  nullBlock = false;
  block;
  path;
  mode;
  uid;
  gid;
  size;
  cksum;
  #type = "Unsupported";
  linkpath;
  uname;
  gname;
  devmaj = 0;
  devmin = 0;
  atime;
  ctime;
  mtime;
  charset;
  comment;
  constructor(data, off = 0, ex, gex) {
    if (Buffer.isBuffer(data)) {
      this.decode(data, off || 0, ex, gex);
    } else if (data) {
      this.#slurp(data);
    }
  }
  decode(buf, off, ex, gex) {
    if (!off) {
      off = 0;
    }
    if (!buf || !(buf.length >= off + 512)) {
      throw new Error("need 512 bytes for header");
    }
    this.path = ex?.path ?? decString(buf, off, 100);
    this.mode = ex?.mode ?? gex?.mode ?? decNumber(buf, off + 100, 8);
    this.uid = ex?.uid ?? gex?.uid ?? decNumber(buf, off + 108, 8);
    this.gid = ex?.gid ?? gex?.gid ?? decNumber(buf, off + 116, 8);
    this.size = ex?.size ?? gex?.size ?? decNumber(buf, off + 124, 12);
    this.mtime = ex?.mtime ?? gex?.mtime ?? decDate(buf, off + 136, 12);
    this.cksum = decNumber(buf, off + 148, 12);
    if (gex)
      this.#slurp(gex, true);
    if (ex)
      this.#slurp(ex);
    const t = decString(buf, off + 156, 1);
    if (isCode(t)) {
      this.#type = t || "0";
    }
    if (this.#type === "0" && this.path.slice(-1) === "/") {
      this.#type = "5";
    }
    if (this.#type === "5") {
      this.size = 0;
    }
    this.linkpath = decString(buf, off + 157, 100);
    if (buf.subarray(off + 257, off + 265).toString() === "ustar\x0000") {
      this.uname = ex?.uname ?? gex?.uname ?? decString(buf, off + 265, 32);
      this.gname = ex?.gname ?? gex?.gname ?? decString(buf, off + 297, 32);
      this.devmaj = ex?.devmaj ?? gex?.devmaj ?? decNumber(buf, off + 329, 8) ?? 0;
      this.devmin = ex?.devmin ?? gex?.devmin ?? decNumber(buf, off + 337, 8) ?? 0;
      if (buf[off + 475] !== 0) {
        const prefix = decString(buf, off + 345, 155);
        this.path = prefix + "/" + this.path;
      } else {
        const prefix = decString(buf, off + 345, 130);
        if (prefix) {
          this.path = prefix + "/" + this.path;
        }
        this.atime = ex?.atime ?? gex?.atime ?? decDate(buf, off + 476, 12);
        this.ctime = ex?.ctime ?? gex?.ctime ?? decDate(buf, off + 488, 12);
      }
    }
    let sum = 8 * 32;
    for (let i = off; i < off + 148; i++) {
      sum += buf[i];
    }
    for (let i = off + 156; i < off + 512; i++) {
      sum += buf[i];
    }
    this.cksumValid = sum === this.cksum;
    if (this.cksum === void 0 && sum === 8 * 32) {
      this.nullBlock = true;
    }
  }
  #slurp(ex, gex = false) {
    Object.assign(this, Object.fromEntries(Object.entries(ex).filter(([k, v]) => {
      return !(v === null || v === void 0 || k === "path" && gex || k === "linkpath" && gex || k === "global");
    })));
  }
  encode(buf, off = 0) {
    if (!buf) {
      buf = this.block = Buffer.alloc(512);
    }
    if (this.#type === "Unsupported") {
      this.#type = "0";
    }
    if (!(buf.length >= off + 512)) {
      throw new Error("need 512 bytes for header");
    }
    const prefixSize = this.ctime || this.atime ? 130 : 155;
    const split = splitPrefix(this.path || "", prefixSize);
    const path2 = split[0];
    const prefix = split[1];
    this.needPax = !!split[2];
    this.needPax = encString(buf, off, 100, path2) || this.needPax;
    this.needPax = encNumber(buf, off + 100, 8, this.mode) || this.needPax;
    this.needPax = encNumber(buf, off + 108, 8, this.uid) || this.needPax;
    this.needPax = encNumber(buf, off + 116, 8, this.gid) || this.needPax;
    this.needPax = encNumber(buf, off + 124, 12, this.size) || this.needPax;
    this.needPax = encDate(buf, off + 136, 12, this.mtime) || this.needPax;
    buf[off + 156] = this.#type.charCodeAt(0);
    this.needPax = encString(buf, off + 157, 100, this.linkpath) || this.needPax;
    buf.write("ustar\x0000", off + 257, 8);
    this.needPax = encString(buf, off + 265, 32, this.uname) || this.needPax;
    this.needPax = encString(buf, off + 297, 32, this.gname) || this.needPax;
    this.needPax = encNumber(buf, off + 329, 8, this.devmaj) || this.needPax;
    this.needPax = encNumber(buf, off + 337, 8, this.devmin) || this.needPax;
    this.needPax = encString(buf, off + 345, prefixSize, prefix) || this.needPax;
    if (buf[off + 475] !== 0) {
      this.needPax = encString(buf, off + 345, 155, prefix) || this.needPax;
    } else {
      this.needPax = encString(buf, off + 345, 130, prefix) || this.needPax;
      this.needPax = encDate(buf, off + 476, 12, this.atime) || this.needPax;
      this.needPax = encDate(buf, off + 488, 12, this.ctime) || this.needPax;
    }
    let sum = 8 * 32;
    for (let i = off; i < off + 148; i++) {
      sum += buf[i];
    }
    for (let i = off + 156; i < off + 512; i++) {
      sum += buf[i];
    }
    this.cksum = sum;
    encNumber(buf, off + 148, 8, this.cksum);
    this.cksumValid = true;
    return this.needPax;
  }
  get type() {
    return this.#type === "Unsupported" ? this.#type : name.get(this.#type);
  }
  get typeKey() {
    return this.#type;
  }
  set type(type) {
    const c = String(code.get(type));
    if (isCode(c) || c === "Unsupported") {
      this.#type = c;
    } else if (isCode(type)) {
      this.#type = type;
    } else {
      throw new TypeError("invalid entry type: " + type);
    }
  }
}
const splitPrefix = (p, prefixSize) => {
  const pathSize = 100;
  let pp = p;
  let prefix = "";
  let ret = void 0;
  const root = posix.parse(p).root || ".";
  if (Buffer.byteLength(pp) < pathSize) {
    ret = [pp, prefix, false];
  } else {
    prefix = posix.dirname(pp);
    pp = posix.basename(pp);
    do {
      if (Buffer.byteLength(pp) <= pathSize && Buffer.byteLength(prefix) <= prefixSize) {
        ret = [pp, prefix, false];
      } else if (Buffer.byteLength(pp) > pathSize && Buffer.byteLength(prefix) <= prefixSize) {
        ret = [pp.slice(0, pathSize - 1), prefix, true];
      } else {
        pp = posix.join(posix.basename(prefix), pp);
        prefix = posix.dirname(prefix);
      }
    } while (prefix !== root && ret === void 0);
    if (!ret) {
      ret = [p.slice(0, pathSize - 1), "", true];
    }
  }
  return ret;
};
const decString = (buf, off, size) => buf.subarray(off, off + size).toString("utf8").replace(/\0.*/, "");
const decDate = (buf, off, size) => numToDate(decNumber(buf, off, size));
const numToDate = (num) => num === void 0 ? void 0 : new Date(num * 1e3);
const decNumber = (buf, off, size) => Number(buf[off]) & 128 ? parse$1(buf.subarray(off, off + size)) : decSmallNumber(buf, off, size);
const nanUndef = (value) => isNaN(value) ? void 0 : value;
const decSmallNumber = (buf, off, size) => nanUndef(parseInt(buf.subarray(off, off + size).toString("utf8").replace(/\0.*$/, "").trim(), 8));
const MAXNUM = {
  12: 8589934591,
  8: 2097151
};
const encNumber = (buf, off, size, num) => num === void 0 ? false : num > MAXNUM[size] || num < 0 ? (encode$1(num, buf.subarray(off, off + size)), true) : (encSmallNumber(buf, off, size, num), false);
const encSmallNumber = (buf, off, size, num) => buf.write(octalString(num, size), off, size, "ascii");
const octalString = (num, size) => padOctal(Math.floor(num).toString(8), size);
const padOctal = (str, size) => (str.length === size - 1 ? str : new Array(size - str.length - 1).join("0") + str + " ") + "\0";
const encDate = (buf, off, size, date) => date === void 0 ? false : encNumber(buf, off, size, date.getTime() / 1e3);
const NULLS = new Array(156).join("\0");
const encString = (buf, off, size, str) => str === void 0 ? false : (buf.write(str + NULLS, off, size, "utf8"), str.length !== Buffer.byteLength(str) || str.length > size);
class Pax {
  atime;
  mtime;
  ctime;
  charset;
  comment;
  gid;
  uid;
  gname;
  uname;
  linkpath;
  dev;
  ino;
  nlink;
  path;
  size;
  mode;
  global;
  constructor(obj, global = false) {
    this.atime = obj.atime;
    this.charset = obj.charset;
    this.comment = obj.comment;
    this.ctime = obj.ctime;
    this.dev = obj.dev;
    this.gid = obj.gid;
    this.global = global;
    this.gname = obj.gname;
    this.ino = obj.ino;
    this.linkpath = obj.linkpath;
    this.mtime = obj.mtime;
    this.nlink = obj.nlink;
    this.path = obj.path;
    this.size = obj.size;
    this.uid = obj.uid;
    this.uname = obj.uname;
  }
  encode() {
    const body = this.encodeBody();
    if (body === "") {
      return Buffer.allocUnsafe(0);
    }
    const bodyLen = Buffer.byteLength(body);
    const bufLen = 512 * Math.ceil(1 + bodyLen / 512);
    const buf = Buffer.allocUnsafe(bufLen);
    for (let i = 0; i < 512; i++) {
      buf[i] = 0;
    }
    new Header({
      // XXX split the path
      // then the path should be PaxHeader + basename, but less than 99,
      // prepend with the dirname
      /* c8 ignore start */
      path: ("PaxHeader/" + basename(this.path ?? "")).slice(0, 99),
      /* c8 ignore stop */
      mode: this.mode || 420,
      uid: this.uid,
      gid: this.gid,
      size: bodyLen,
      mtime: this.mtime,
      type: this.global ? "GlobalExtendedHeader" : "ExtendedHeader",
      linkpath: "",
      uname: this.uname || "",
      gname: this.gname || "",
      devmaj: 0,
      devmin: 0,
      atime: this.atime,
      ctime: this.ctime
    }).encode(buf);
    buf.write(body, 512, bodyLen, "utf8");
    for (let i = bodyLen + 512; i < buf.length; i++) {
      buf[i] = 0;
    }
    return buf;
  }
  encodeBody() {
    return this.encodeField("path") + this.encodeField("ctime") + this.encodeField("atime") + this.encodeField("dev") + this.encodeField("ino") + this.encodeField("nlink") + this.encodeField("charset") + this.encodeField("comment") + this.encodeField("gid") + this.encodeField("gname") + this.encodeField("linkpath") + this.encodeField("mtime") + this.encodeField("size") + this.encodeField("uid") + this.encodeField("uname");
  }
  encodeField(field) {
    if (this[field] === void 0) {
      return "";
    }
    const r = this[field];
    const v = r instanceof Date ? r.getTime() / 1e3 : r;
    const s = " " + (field === "dev" || field === "ino" || field === "nlink" ? "SCHILY." : "") + field + "=" + v + "\n";
    const byteLen = Buffer.byteLength(s);
    let digits = Math.floor(Math.log(byteLen) / Math.log(10)) + 1;
    if (byteLen + digits >= Math.pow(10, digits)) {
      digits += 1;
    }
    const len = digits + byteLen;
    return len + s;
  }
  static parse(str, ex, g = false) {
    return new Pax(merge(parseKV(str), ex), g);
  }
}
const merge = (a, b) => b ? Object.assign({}, b, a) : a;
const parseKV = (str) => str.replace(/\n$/, "").split("\n").reduce(parseKVLine, /* @__PURE__ */ Object.create(null));
const parseKVLine = (set, line) => {
  const n = parseInt(line, 10);
  if (n !== Buffer.byteLength(line) + 1) {
    return set;
  }
  line = line.slice((n + " ").length);
  const kv = line.split("=");
  const r = kv.shift();
  if (!r) {
    return set;
  }
  const k = r.replace(/^SCHILY\.(dev|ino|nlink)/, "$1");
  const v = kv.join("=");
  set[k] = /^([A-Z]+\.)?([mac]|birth|creation)time$/.test(k) ? new Date(Number(v) * 1e3) : /^[0-9]+$/.test(v) ? +v : v;
  return set;
};
const platform$3 = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
const normalizeWindowsPath = platform$3 !== "win32" ? (p) => p : (p) => p && p.replace(/\\/g, "/");
class ReadEntry extends Minipass {
  extended;
  globalExtended;
  header;
  startBlockSize;
  blockRemain;
  remain;
  type;
  meta = false;
  ignore = false;
  path;
  mode;
  uid;
  gid;
  uname;
  gname;
  size = 0;
  mtime;
  atime;
  ctime;
  linkpath;
  dev;
  ino;
  nlink;
  invalid = false;
  absolute;
  unsupported = false;
  constructor(header, ex, gex) {
    super({});
    this.pause();
    this.extended = ex;
    this.globalExtended = gex;
    this.header = header;
    this.remain = header.size ?? 0;
    this.startBlockSize = 512 * Math.ceil(this.remain / 512);
    this.blockRemain = this.startBlockSize;
    this.type = header.type;
    switch (this.type) {
      case "File":
      case "OldFile":
      case "Link":
      case "SymbolicLink":
      case "CharacterDevice":
      case "BlockDevice":
      case "Directory":
      case "FIFO":
      case "ContiguousFile":
      case "GNUDumpDir":
        break;
      case "NextFileHasLongLinkpath":
      case "NextFileHasLongPath":
      case "OldGnuLongPath":
      case "GlobalExtendedHeader":
      case "ExtendedHeader":
      case "OldExtendedHeader":
        this.meta = true;
        break;
      // NOTE: gnutar and bsdtar treat unrecognized types as 'File'
      // it may be worth doing the same, but with a warning.
      default:
        this.ignore = true;
    }
    if (!header.path) {
      throw new Error("no path provided for tar.ReadEntry");
    }
    this.path = normalizeWindowsPath(header.path);
    this.mode = header.mode;
    if (this.mode) {
      this.mode = this.mode & 4095;
    }
    this.uid = header.uid;
    this.gid = header.gid;
    this.uname = header.uname;
    this.gname = header.gname;
    this.size = this.remain;
    this.mtime = header.mtime;
    this.atime = header.atime;
    this.ctime = header.ctime;
    this.linkpath = header.linkpath ? normalizeWindowsPath(header.linkpath) : void 0;
    this.uname = header.uname;
    this.gname = header.gname;
    if (ex) {
      this.#slurp(ex);
    }
    if (gex) {
      this.#slurp(gex, true);
    }
  }
  write(data) {
    const writeLen = data.length;
    if (writeLen > this.blockRemain) {
      throw new Error("writing more to entry than is appropriate");
    }
    const r = this.remain;
    const br = this.blockRemain;
    this.remain = Math.max(0, r - writeLen);
    this.blockRemain = Math.max(0, br - writeLen);
    if (this.ignore) {
      return true;
    }
    if (r >= writeLen) {
      return super.write(data);
    }
    return super.write(data.subarray(0, r));
  }
  #slurp(ex, gex = false) {
    if (ex.path)
      ex.path = normalizeWindowsPath(ex.path);
    if (ex.linkpath)
      ex.linkpath = normalizeWindowsPath(ex.linkpath);
    Object.assign(this, Object.fromEntries(Object.entries(ex).filter(([k, v]) => {
      return !(v === null || v === void 0 || k === "path" && gex);
    })));
  }
}
const warnMethod = (self, code2, message, data = {}) => {
  if (self.file) {
    data.file = self.file;
  }
  if (self.cwd) {
    data.cwd = self.cwd;
  }
  data.code = message instanceof Error && message.code || code2;
  data.tarCode = code2;
  if (!self.strict && data.recoverable !== false) {
    if (message instanceof Error) {
      data = Object.assign(message, data);
      message = message.message;
    }
    self.emit("warn", code2, message, data);
  } else if (message instanceof Error) {
    self.emit("error", Object.assign(message, data));
  } else {
    self.emit("error", Object.assign(new Error(`${code2}: ${message}`), data));
  }
};
const maxMetaEntrySize = 1024 * 1024;
const gzipHeader = Buffer.from([31, 139]);
const zstdHeader = Buffer.from([40, 181, 47, 253]);
const ZIP_HEADER_LEN = Math.max(gzipHeader.length, zstdHeader.length);
const STATE = Symbol("state");
const WRITEENTRY = Symbol("writeEntry");
const READENTRY = Symbol("readEntry");
const NEXTENTRY = Symbol("nextEntry");
const PROCESSENTRY = Symbol("processEntry");
const EX = Symbol("extendedHeader");
const GEX = Symbol("globalExtendedHeader");
const META = Symbol("meta");
const EMITMETA = Symbol("emitMeta");
const BUFFER = Symbol("buffer");
const QUEUE$1 = Symbol("queue");
const ENDED$2 = Symbol("ended");
const EMITTEDEND = Symbol("emittedEnd");
const EMIT = Symbol("emit");
const UNZIP = Symbol("unzip");
const CONSUMECHUNK = Symbol("consumeChunk");
const CONSUMECHUNKSUB = Symbol("consumeChunkSub");
const CONSUMEBODY = Symbol("consumeBody");
const CONSUMEMETA = Symbol("consumeMeta");
const CONSUMEHEADER = Symbol("consumeHeader");
const CONSUMING = Symbol("consuming");
const BUFFERCONCAT = Symbol("bufferConcat");
const MAYBEEND = Symbol("maybeEnd");
const WRITING = Symbol("writing");
const ABORTED = Symbol("aborted");
const DONE = Symbol("onDone");
const SAW_VALID_ENTRY = Symbol("sawValidEntry");
const SAW_NULL_BLOCK = Symbol("sawNullBlock");
const SAW_EOF = Symbol("sawEOF");
const CLOSESTREAM = Symbol("closeStream");
const noop = () => true;
class Parser extends EventEmitter$1 {
  file;
  strict;
  maxMetaEntrySize;
  filter;
  brotli;
  zstd;
  writable = true;
  readable = false;
  [QUEUE$1] = [];
  [BUFFER];
  [READENTRY];
  [WRITEENTRY];
  [STATE] = "begin";
  [META] = "";
  [EX];
  [GEX];
  [ENDED$2] = false;
  [UNZIP];
  [ABORTED] = false;
  [SAW_VALID_ENTRY];
  [SAW_NULL_BLOCK] = false;
  [SAW_EOF] = false;
  [WRITING] = false;
  [CONSUMING] = false;
  [EMITTEDEND] = false;
  constructor(opt = {}) {
    super();
    this.file = opt.file || "";
    this.on(DONE, () => {
      if (this[STATE] === "begin" || this[SAW_VALID_ENTRY] === false) {
        this.warn("TAR_BAD_ARCHIVE", "Unrecognized archive format");
      }
    });
    if (opt.ondone) {
      this.on(DONE, opt.ondone);
    } else {
      this.on(DONE, () => {
        this.emit("prefinish");
        this.emit("finish");
        this.emit("end");
      });
    }
    this.strict = !!opt.strict;
    this.maxMetaEntrySize = opt.maxMetaEntrySize || maxMetaEntrySize;
    this.filter = typeof opt.filter === "function" ? opt.filter : noop;
    const isTBR = opt.file && (opt.file.endsWith(".tar.br") || opt.file.endsWith(".tbr"));
    this.brotli = !(opt.gzip || opt.zstd) && opt.brotli !== void 0 ? opt.brotli : isTBR ? void 0 : false;
    const isTZST = opt.file && (opt.file.endsWith(".tar.zst") || opt.file.endsWith(".tzst"));
    this.zstd = !(opt.gzip || opt.brotli) && opt.zstd !== void 0 ? opt.zstd : isTZST ? true : void 0;
    this.on("end", () => this[CLOSESTREAM]());
    if (typeof opt.onwarn === "function") {
      this.on("warn", opt.onwarn);
    }
    if (typeof opt.onReadEntry === "function") {
      this.on("entry", opt.onReadEntry);
    }
  }
  warn(code2, message, data = {}) {
    warnMethod(this, code2, message, data);
  }
  [CONSUMEHEADER](chunk, position) {
    if (this[SAW_VALID_ENTRY] === void 0) {
      this[SAW_VALID_ENTRY] = false;
    }
    let header;
    try {
      header = new Header(chunk, position, this[EX], this[GEX]);
    } catch (er) {
      return this.warn("TAR_ENTRY_INVALID", er);
    }
    if (header.nullBlock) {
      if (this[SAW_NULL_BLOCK]) {
        this[SAW_EOF] = true;
        if (this[STATE] === "begin") {
          this[STATE] = "header";
        }
        this[EMIT]("eof");
      } else {
        this[SAW_NULL_BLOCK] = true;
        this[EMIT]("nullBlock");
      }
    } else {
      this[SAW_NULL_BLOCK] = false;
      if (!header.cksumValid) {
        this.warn("TAR_ENTRY_INVALID", "checksum failure", { header });
      } else if (!header.path) {
        this.warn("TAR_ENTRY_INVALID", "path is required", { header });
      } else {
        const type = header.type;
        if (/^(Symbolic)?Link$/.test(type) && !header.linkpath) {
          this.warn("TAR_ENTRY_INVALID", "linkpath required", {
            header
          });
        } else if (!/^(Symbolic)?Link$/.test(type) && !/^(Global)?ExtendedHeader$/.test(type) && header.linkpath) {
          this.warn("TAR_ENTRY_INVALID", "linkpath forbidden", {
            header
          });
        } else {
          const entry = this[WRITEENTRY] = new ReadEntry(header, this[EX], this[GEX]);
          if (!this[SAW_VALID_ENTRY]) {
            if (entry.remain) {
              const onend = () => {
                if (!entry.invalid) {
                  this[SAW_VALID_ENTRY] = true;
                }
              };
              entry.on("end", onend);
            } else {
              this[SAW_VALID_ENTRY] = true;
            }
          }
          if (entry.meta) {
            if (entry.size > this.maxMetaEntrySize) {
              entry.ignore = true;
              this[EMIT]("ignoredEntry", entry);
              this[STATE] = "ignore";
              entry.resume();
            } else if (entry.size > 0) {
              this[META] = "";
              entry.on("data", (c) => this[META] += c);
              this[STATE] = "meta";
            }
          } else {
            this[EX] = void 0;
            entry.ignore = entry.ignore || !this.filter(entry.path, entry);
            if (entry.ignore) {
              this[EMIT]("ignoredEntry", entry);
              this[STATE] = entry.remain ? "ignore" : "header";
              entry.resume();
            } else {
              if (entry.remain) {
                this[STATE] = "body";
              } else {
                this[STATE] = "header";
                entry.end();
              }
              if (!this[READENTRY]) {
                this[QUEUE$1].push(entry);
                this[NEXTENTRY]();
              } else {
                this[QUEUE$1].push(entry);
              }
            }
          }
        }
      }
    }
  }
  [CLOSESTREAM]() {
    queueMicrotask(() => this.emit("close"));
  }
  [PROCESSENTRY](entry) {
    let go = true;
    if (!entry) {
      this[READENTRY] = void 0;
      go = false;
    } else if (Array.isArray(entry)) {
      const [ev, ...args] = entry;
      this.emit(ev, ...args);
    } else {
      this[READENTRY] = entry;
      this.emit("entry", entry);
      if (!entry.emittedEnd) {
        entry.on("end", () => this[NEXTENTRY]());
        go = false;
      }
    }
    return go;
  }
  [NEXTENTRY]() {
    do {
    } while (this[PROCESSENTRY](this[QUEUE$1].shift()));
    if (!this[QUEUE$1].length) {
      const re = this[READENTRY];
      const drainNow = !re || re.flowing || re.size === re.remain;
      if (drainNow) {
        if (!this[WRITING]) {
          this.emit("drain");
        }
      } else {
        re.once("drain", () => this.emit("drain"));
      }
    }
  }
  [CONSUMEBODY](chunk, position) {
    const entry = this[WRITEENTRY];
    if (!entry) {
      throw new Error("attempt to consume body without entry??");
    }
    const br = entry.blockRemain ?? 0;
    const c = br >= chunk.length && position === 0 ? chunk : chunk.subarray(position, position + br);
    entry.write(c);
    if (!entry.blockRemain) {
      this[STATE] = "header";
      this[WRITEENTRY] = void 0;
      entry.end();
    }
    return c.length;
  }
  [CONSUMEMETA](chunk, position) {
    const entry = this[WRITEENTRY];
    const ret = this[CONSUMEBODY](chunk, position);
    if (!this[WRITEENTRY] && entry) {
      this[EMITMETA](entry);
    }
    return ret;
  }
  [EMIT](ev, data, extra) {
    if (!this[QUEUE$1].length && !this[READENTRY]) {
      this.emit(ev, data, extra);
    } else {
      this[QUEUE$1].push([ev, data, extra]);
    }
  }
  [EMITMETA](entry) {
    this[EMIT]("meta", this[META]);
    switch (entry.type) {
      case "ExtendedHeader":
      case "OldExtendedHeader":
        this[EX] = Pax.parse(this[META], this[EX], false);
        break;
      case "GlobalExtendedHeader":
        this[GEX] = Pax.parse(this[META], this[GEX], true);
        break;
      case "NextFileHasLongPath":
      case "OldGnuLongPath": {
        const ex = this[EX] ?? /* @__PURE__ */ Object.create(null);
        this[EX] = ex;
        ex.path = this[META].replace(/\0.*/, "");
        break;
      }
      case "NextFileHasLongLinkpath": {
        const ex = this[EX] || /* @__PURE__ */ Object.create(null);
        this[EX] = ex;
        ex.linkpath = this[META].replace(/\0.*/, "");
        break;
      }
      /* c8 ignore start */
      default:
        throw new Error("unknown meta: " + entry.type);
    }
  }
  abort(error) {
    this[ABORTED] = true;
    this.emit("abort", error);
    this.warn("TAR_ABORT", error, { recoverable: false });
  }
  write(chunk, encoding, cb) {
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(
        chunk,
        /* c8 ignore next */
        typeof encoding === "string" ? encoding : "utf8"
      );
    }
    if (this[ABORTED]) {
      cb?.();
      return false;
    }
    const needSniff = this[UNZIP] === void 0 || this.brotli === void 0 && this[UNZIP] === false;
    if (needSniff && chunk) {
      if (this[BUFFER]) {
        chunk = Buffer.concat([this[BUFFER], chunk]);
        this[BUFFER] = void 0;
      }
      if (chunk.length < ZIP_HEADER_LEN) {
        this[BUFFER] = chunk;
        cb?.();
        return true;
      }
      for (let i = 0; this[UNZIP] === void 0 && i < gzipHeader.length; i++) {
        if (chunk[i] !== gzipHeader[i]) {
          this[UNZIP] = false;
        }
      }
      let isZstd = false;
      if (this[UNZIP] === false && this.zstd !== false) {
        isZstd = true;
        for (let i = 0; i < zstdHeader.length; i++) {
          if (chunk[i] !== zstdHeader[i]) {
            isZstd = false;
            break;
          }
        }
      }
      const maybeBrotli = this.brotli === void 0 && !isZstd;
      if (this[UNZIP] === false && maybeBrotli) {
        if (chunk.length < 512) {
          if (this[ENDED$2]) {
            this.brotli = true;
          } else {
            this[BUFFER] = chunk;
            cb?.();
            return true;
          }
        } else {
          try {
            new Header(chunk.subarray(0, 512));
            this.brotli = false;
          } catch (_) {
            this.brotli = true;
          }
        }
      }
      if (this[UNZIP] === void 0 || this[UNZIP] === false && (this.brotli || isZstd)) {
        const ended = this[ENDED$2];
        this[ENDED$2] = false;
        this[UNZIP] = this[UNZIP] === void 0 ? new Unzip({}) : isZstd ? new ZstdDecompress({}) : new BrotliDecompress({});
        this[UNZIP].on("data", (chunk2) => this[CONSUMECHUNK](chunk2));
        this[UNZIP].on("error", (er) => this.abort(er));
        this[UNZIP].on("end", () => {
          this[ENDED$2] = true;
          this[CONSUMECHUNK]();
        });
        this[WRITING] = true;
        const ret2 = !!this[UNZIP][ended ? "end" : "write"](chunk);
        this[WRITING] = false;
        cb?.();
        return ret2;
      }
    }
    this[WRITING] = true;
    if (this[UNZIP]) {
      this[UNZIP].write(chunk);
    } else {
      this[CONSUMECHUNK](chunk);
    }
    this[WRITING] = false;
    const ret = this[QUEUE$1].length ? false : this[READENTRY] ? this[READENTRY].flowing : true;
    if (!ret && !this[QUEUE$1].length) {
      this[READENTRY]?.once("drain", () => this.emit("drain"));
    }
    cb?.();
    return ret;
  }
  [BUFFERCONCAT](c) {
    if (c && !this[ABORTED]) {
      this[BUFFER] = this[BUFFER] ? Buffer.concat([this[BUFFER], c]) : c;
    }
  }
  [MAYBEEND]() {
    if (this[ENDED$2] && !this[EMITTEDEND] && !this[ABORTED] && !this[CONSUMING]) {
      this[EMITTEDEND] = true;
      const entry = this[WRITEENTRY];
      if (entry && entry.blockRemain) {
        const have = this[BUFFER] ? this[BUFFER].length : 0;
        this.warn("TAR_BAD_ARCHIVE", `Truncated input (needed ${entry.blockRemain} more bytes, only ${have} available)`, { entry });
        if (this[BUFFER]) {
          entry.write(this[BUFFER]);
        }
        entry.end();
      }
      this[EMIT](DONE);
    }
  }
  [CONSUMECHUNK](chunk) {
    if (this[CONSUMING] && chunk) {
      this[BUFFERCONCAT](chunk);
    } else if (!chunk && !this[BUFFER]) {
      this[MAYBEEND]();
    } else if (chunk) {
      this[CONSUMING] = true;
      if (this[BUFFER]) {
        this[BUFFERCONCAT](chunk);
        const c = this[BUFFER];
        this[BUFFER] = void 0;
        this[CONSUMECHUNKSUB](c);
      } else {
        this[CONSUMECHUNKSUB](chunk);
      }
      while (this[BUFFER] && this[BUFFER]?.length >= 512 && !this[ABORTED] && !this[SAW_EOF]) {
        const c = this[BUFFER];
        this[BUFFER] = void 0;
        this[CONSUMECHUNKSUB](c);
      }
      this[CONSUMING] = false;
    }
    if (!this[BUFFER] || this[ENDED$2]) {
      this[MAYBEEND]();
    }
  }
  [CONSUMECHUNKSUB](chunk) {
    let position = 0;
    const length = chunk.length;
    while (position + 512 <= length && !this[ABORTED] && !this[SAW_EOF]) {
      switch (this[STATE]) {
        case "begin":
        case "header":
          this[CONSUMEHEADER](chunk, position);
          position += 512;
          break;
        case "ignore":
        case "body":
          position += this[CONSUMEBODY](chunk, position);
          break;
        case "meta":
          position += this[CONSUMEMETA](chunk, position);
          break;
        /* c8 ignore start */
        default:
          throw new Error("invalid state: " + this[STATE]);
      }
    }
    if (position < length) {
      if (this[BUFFER]) {
        this[BUFFER] = Buffer.concat([
          chunk.subarray(position),
          this[BUFFER]
        ]);
      } else {
        this[BUFFER] = chunk.subarray(position);
      }
    }
  }
  end(chunk, encoding, cb) {
    if (typeof chunk === "function") {
      cb = chunk;
      encoding = void 0;
      chunk = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, encoding);
    }
    if (cb)
      this.once("finish", cb);
    if (!this[ABORTED]) {
      if (this[UNZIP]) {
        if (chunk)
          this[UNZIP].write(chunk);
        this[UNZIP].end();
      } else {
        this[ENDED$2] = true;
        if (this.brotli === void 0 || this.zstd === void 0)
          chunk = chunk || Buffer.alloc(0);
        if (chunk)
          this.write(chunk);
        this[MAYBEEND]();
      }
    }
    return this;
  }
}
const stripTrailingSlashes = (str) => {
  let i = str.length - 1;
  let slashesStart = -1;
  while (i > -1 && str.charAt(i) === "/") {
    slashesStart = i;
    i--;
  }
  return slashesStart === -1 ? str : str.slice(0, slashesStart);
};
const onReadEntryFunction = (opt) => {
  const onReadEntry = opt.onReadEntry;
  opt.onReadEntry = onReadEntry ? (e) => {
    onReadEntry(e);
    e.resume();
  } : (e) => e.resume();
};
const filesFilter = (opt, files) => {
  const map = new Map(files.map((f) => [stripTrailingSlashes(f), true]));
  const filter = opt.filter;
  const mapHas = (file, r = "") => {
    const root = r || parse$2(file).root || ".";
    let ret;
    if (file === root)
      ret = false;
    else {
      const m = map.get(file);
      if (m !== void 0) {
        ret = m;
      } else {
        ret = mapHas(dirname(file), root);
      }
    }
    map.set(file, ret);
    return ret;
  };
  opt.filter = filter ? (file, entry) => filter(file, entry) && mapHas(stripTrailingSlashes(file)) : (file) => mapHas(stripTrailingSlashes(file));
};
const listFileSync = (opt) => {
  const p = new Parser(opt);
  const file = opt.file;
  let fd;
  try {
    fd = fs$1.openSync(file, "r");
    const stat = fs$1.fstatSync(fd);
    const readSize = opt.maxReadSize || 16 * 1024 * 1024;
    if (stat.size < readSize) {
      const buf = Buffer.allocUnsafe(stat.size);
      const read = fs$1.readSync(fd, buf, 0, stat.size, 0);
      p.end(read === buf.byteLength ? buf : buf.subarray(0, read));
    } else {
      let pos2 = 0;
      const buf = Buffer.allocUnsafe(readSize);
      while (pos2 < stat.size) {
        const bytesRead = fs$1.readSync(fd, buf, 0, readSize, pos2);
        if (bytesRead === 0)
          break;
        pos2 += bytesRead;
        p.write(buf.subarray(0, bytesRead));
      }
      p.end();
    }
  } finally {
    if (typeof fd === "number") {
      try {
        fs$1.closeSync(fd);
      } catch (er) {
      }
    }
  }
};
const listFile = (opt, _files) => {
  const parse2 = new Parser(opt);
  const readSize = opt.maxReadSize || 16 * 1024 * 1024;
  const file = opt.file;
  const p = new Promise((resolve, reject) => {
    parse2.on("error", reject);
    parse2.on("end", resolve);
    fs$1.stat(file, (er, stat) => {
      if (er) {
        reject(er);
      } else {
        const stream = new ReadStream(file, {
          readSize,
          size: stat.size
        });
        stream.on("error", reject);
        stream.pipe(parse2);
      }
    });
  });
  return p;
};
const list = makeCommand(listFileSync, listFile, (opt) => new Parser(opt), (opt) => new Parser(opt), (opt, files) => {
  if (files?.length)
    filesFilter(opt, files);
  if (!opt.noResume)
    onReadEntryFunction(opt);
});
const modeFix = (mode, isDir, portable) => {
  mode &= 4095;
  if (portable) {
    mode = (mode | 384) & -19;
  }
  if (isDir) {
    if (mode & 256) {
      mode |= 64;
    }
    if (mode & 32) {
      mode |= 8;
    }
    if (mode & 4) {
      mode |= 1;
    }
  }
  return mode;
};
const { isAbsolute, parse } = win32;
const stripAbsolutePath = (path2) => {
  let r = "";
  let parsed = parse(path2);
  while (isAbsolute(path2) || parsed.root) {
    const root = path2.charAt(0) === "/" && path2.slice(0, 4) !== "//?/" ? "/" : parsed.root;
    path2 = path2.slice(root.length);
    r += root;
    parsed = parse(path2);
  }
  return [r, path2];
};
const raw = ["|", "<", ">", "?", ":"];
const win = raw.map((char) => String.fromCharCode(61440 + char.charCodeAt(0)));
const toWin = new Map(raw.map((char, i) => [char, win[i]]));
const toRaw = new Map(win.map((char, i) => [char, raw[i]]));
const encode = (s) => raw.reduce((s2, c) => s2.split(c).join(toWin.get(c)), s);
const decode = (s) => win.reduce((s2, c) => s2.split(c).join(toRaw.get(c)), s);
const prefixPath = (path2, prefix) => {
  if (!prefix) {
    return normalizeWindowsPath(path2);
  }
  path2 = normalizeWindowsPath(path2).replace(/^\.(\/|$)/, "");
  return stripTrailingSlashes(prefix) + "/" + path2;
};
const maxReadSize = 16 * 1024 * 1024;
const PROCESS$1 = Symbol("process");
const FILE$1 = Symbol("file");
const DIRECTORY$1 = Symbol("directory");
const SYMLINK$1 = Symbol("symlink");
const HARDLINK$1 = Symbol("hardlink");
const HEADER = Symbol("header");
const READ = Symbol("read");
const LSTAT = Symbol("lstat");
const ONLSTAT = Symbol("onlstat");
const ONREAD = Symbol("onread");
const ONREADLINK = Symbol("onreadlink");
const OPENFILE = Symbol("openfile");
const ONOPENFILE = Symbol("onopenfile");
const CLOSE = Symbol("close");
const MODE = Symbol("mode");
const AWAITDRAIN = Symbol("awaitDrain");
const ONDRAIN$1 = Symbol("ondrain");
const PREFIX = Symbol("prefix");
class WriteEntry extends Minipass {
  path;
  portable;
  myuid = process.getuid && process.getuid() || 0;
  // until node has builtin pwnam functions, this'll have to do
  myuser = process.env.USER || "";
  maxReadSize;
  linkCache;
  statCache;
  preservePaths;
  cwd;
  strict;
  mtime;
  noPax;
  noMtime;
  prefix;
  fd;
  blockLen = 0;
  blockRemain = 0;
  buf;
  pos = 0;
  remain = 0;
  length = 0;
  offset = 0;
  win32;
  absolute;
  header;
  type;
  linkpath;
  stat;
  onWriteEntry;
  #hadError = false;
  constructor(p, opt_ = {}) {
    const opt = dealias(opt_);
    super();
    this.path = normalizeWindowsPath(p);
    this.portable = !!opt.portable;
    this.maxReadSize = opt.maxReadSize || maxReadSize;
    this.linkCache = opt.linkCache || /* @__PURE__ */ new Map();
    this.statCache = opt.statCache || /* @__PURE__ */ new Map();
    this.preservePaths = !!opt.preservePaths;
    this.cwd = normalizeWindowsPath(opt.cwd || process.cwd());
    this.strict = !!opt.strict;
    this.noPax = !!opt.noPax;
    this.noMtime = !!opt.noMtime;
    this.mtime = opt.mtime;
    this.prefix = opt.prefix ? normalizeWindowsPath(opt.prefix) : void 0;
    this.onWriteEntry = opt.onWriteEntry;
    if (typeof opt.onwarn === "function") {
      this.on("warn", opt.onwarn);
    }
    let pathWarn = false;
    if (!this.preservePaths) {
      const [root, stripped] = stripAbsolutePath(this.path);
      if (root && typeof stripped === "string") {
        this.path = stripped;
        pathWarn = root;
      }
    }
    this.win32 = !!opt.win32 || process.platform === "win32";
    if (this.win32) {
      this.path = decode(this.path.replace(/\\/g, "/"));
      p = p.replace(/\\/g, "/");
    }
    this.absolute = normalizeWindowsPath(opt.absolute || path.resolve(this.cwd, p));
    if (this.path === "") {
      this.path = "./";
    }
    if (pathWarn) {
      this.warn("TAR_ENTRY_INFO", `stripping ${pathWarn} from absolute path`, {
        entry: this,
        path: pathWarn + this.path
      });
    }
    const cs = this.statCache.get(this.absolute);
    if (cs) {
      this[ONLSTAT](cs);
    } else {
      this[LSTAT]();
    }
  }
  warn(code2, message, data = {}) {
    return warnMethod(this, code2, message, data);
  }
  emit(ev, ...data) {
    if (ev === "error") {
      this.#hadError = true;
    }
    return super.emit(ev, ...data);
  }
  [LSTAT]() {
    fs.lstat(this.absolute, (er, stat) => {
      if (er) {
        return this.emit("error", er);
      }
      this[ONLSTAT](stat);
    });
  }
  [ONLSTAT](stat) {
    this.statCache.set(this.absolute, stat);
    this.stat = stat;
    if (!stat.isFile()) {
      stat.size = 0;
    }
    this.type = getType(stat);
    this.emit("stat", stat);
    this[PROCESS$1]();
  }
  [PROCESS$1]() {
    switch (this.type) {
      case "File":
        return this[FILE$1]();
      case "Directory":
        return this[DIRECTORY$1]();
      case "SymbolicLink":
        return this[SYMLINK$1]();
      // unsupported types are ignored.
      default:
        return this.end();
    }
  }
  [MODE](mode) {
    return modeFix(mode, this.type === "Directory", this.portable);
  }
  [PREFIX](path2) {
    return prefixPath(path2, this.prefix);
  }
  [HEADER]() {
    if (!this.stat) {
      throw new Error("cannot write header before stat");
    }
    if (this.type === "Directory" && this.portable) {
      this.noMtime = true;
    }
    this.onWriteEntry?.(this);
    this.header = new Header({
      path: this[PREFIX](this.path),
      // only apply the prefix to hard links.
      linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[PREFIX](this.linkpath) : this.linkpath,
      // only the permissions and setuid/setgid/sticky bitflags
      // not the higher-order bits that specify file type
      mode: this[MODE](this.stat.mode),
      uid: this.portable ? void 0 : this.stat.uid,
      gid: this.portable ? void 0 : this.stat.gid,
      size: this.stat.size,
      mtime: this.noMtime ? void 0 : this.mtime || this.stat.mtime,
      /* c8 ignore next */
      type: this.type === "Unsupported" ? void 0 : this.type,
      uname: this.portable ? void 0 : this.stat.uid === this.myuid ? this.myuser : "",
      atime: this.portable ? void 0 : this.stat.atime,
      ctime: this.portable ? void 0 : this.stat.ctime
    });
    if (this.header.encode() && !this.noPax) {
      super.write(new Pax({
        atime: this.portable ? void 0 : this.header.atime,
        ctime: this.portable ? void 0 : this.header.ctime,
        gid: this.portable ? void 0 : this.header.gid,
        mtime: this.noMtime ? void 0 : this.mtime || this.header.mtime,
        path: this[PREFIX](this.path),
        linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[PREFIX](this.linkpath) : this.linkpath,
        size: this.header.size,
        uid: this.portable ? void 0 : this.header.uid,
        uname: this.portable ? void 0 : this.header.uname,
        dev: this.portable ? void 0 : this.stat.dev,
        ino: this.portable ? void 0 : this.stat.ino,
        nlink: this.portable ? void 0 : this.stat.nlink
      }).encode());
    }
    const block = this.header?.block;
    if (!block) {
      throw new Error("failed to encode header");
    }
    super.write(block);
  }
  [DIRECTORY$1]() {
    if (!this.stat) {
      throw new Error("cannot create directory entry without stat");
    }
    if (this.path.slice(-1) !== "/") {
      this.path += "/";
    }
    this.stat.size = 0;
    this[HEADER]();
    this.end();
  }
  [SYMLINK$1]() {
    fs.readlink(this.absolute, (er, linkpath) => {
      if (er) {
        return this.emit("error", er);
      }
      this[ONREADLINK](linkpath);
    });
  }
  [ONREADLINK](linkpath) {
    this.linkpath = normalizeWindowsPath(linkpath);
    this[HEADER]();
    this.end();
  }
  [HARDLINK$1](linkpath) {
    if (!this.stat) {
      throw new Error("cannot create link entry without stat");
    }
    this.type = "Link";
    this.linkpath = normalizeWindowsPath(path.relative(this.cwd, linkpath));
    this.stat.size = 0;
    this[HEADER]();
    this.end();
  }
  [FILE$1]() {
    if (!this.stat) {
      throw new Error("cannot create file entry without stat");
    }
    if (this.stat.nlink > 1) {
      const linkKey = `${this.stat.dev}:${this.stat.ino}`;
      const linkpath = this.linkCache.get(linkKey);
      if (linkpath?.indexOf(this.cwd) === 0) {
        return this[HARDLINK$1](linkpath);
      }
      this.linkCache.set(linkKey, this.absolute);
    }
    this[HEADER]();
    if (this.stat.size === 0) {
      return this.end();
    }
    this[OPENFILE]();
  }
  [OPENFILE]() {
    fs.open(this.absolute, "r", (er, fd) => {
      if (er) {
        return this.emit("error", er);
      }
      this[ONOPENFILE](fd);
    });
  }
  [ONOPENFILE](fd) {
    this.fd = fd;
    if (this.#hadError) {
      return this[CLOSE]();
    }
    if (!this.stat) {
      throw new Error("should stat before calling onopenfile");
    }
    this.blockLen = 512 * Math.ceil(this.stat.size / 512);
    this.blockRemain = this.blockLen;
    const bufLen = Math.min(this.blockLen, this.maxReadSize);
    this.buf = Buffer.allocUnsafe(bufLen);
    this.offset = 0;
    this.pos = 0;
    this.remain = this.stat.size;
    this.length = this.buf.length;
    this[READ]();
  }
  [READ]() {
    const { fd, buf, offset, length, pos: pos2 } = this;
    if (fd === void 0 || buf === void 0) {
      throw new Error("cannot read file without first opening");
    }
    fs.read(fd, buf, offset, length, pos2, (er, bytesRead) => {
      if (er) {
        return this[CLOSE](() => this.emit("error", er));
      }
      this[ONREAD](bytesRead);
    });
  }
  /* c8 ignore start */
  [CLOSE](cb = () => {
  }) {
    if (this.fd !== void 0)
      fs.close(this.fd, cb);
  }
  [ONREAD](bytesRead) {
    if (bytesRead <= 0 && this.remain > 0) {
      const er = Object.assign(new Error("encountered unexpected EOF"), {
        path: this.absolute,
        syscall: "read",
        code: "EOF"
      });
      return this[CLOSE](() => this.emit("error", er));
    }
    if (bytesRead > this.remain) {
      const er = Object.assign(new Error("did not encounter expected EOF"), {
        path: this.absolute,
        syscall: "read",
        code: "EOF"
      });
      return this[CLOSE](() => this.emit("error", er));
    }
    if (!this.buf) {
      throw new Error("should have created buffer prior to reading");
    }
    if (bytesRead === this.remain) {
      for (let i = bytesRead; i < this.length && bytesRead < this.blockRemain; i++) {
        this.buf[i + this.offset] = 0;
        bytesRead++;
        this.remain++;
      }
    }
    const chunk = this.offset === 0 && bytesRead === this.buf.length ? this.buf : this.buf.subarray(this.offset, this.offset + bytesRead);
    const flushed = this.write(chunk);
    if (!flushed) {
      this[AWAITDRAIN](() => this[ONDRAIN$1]());
    } else {
      this[ONDRAIN$1]();
    }
  }
  [AWAITDRAIN](cb) {
    this.once("drain", cb);
  }
  write(chunk, encoding, cb) {
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
    }
    if (this.blockRemain < chunk.length) {
      const er = Object.assign(new Error("writing more data than expected"), {
        path: this.absolute
      });
      return this.emit("error", er);
    }
    this.remain -= chunk.length;
    this.blockRemain -= chunk.length;
    this.pos += chunk.length;
    this.offset += chunk.length;
    return super.write(chunk, null, cb);
  }
  [ONDRAIN$1]() {
    if (!this.remain) {
      if (this.blockRemain) {
        super.write(Buffer.alloc(this.blockRemain));
      }
      return this[CLOSE]((er) => er ? this.emit("error", er) : this.end());
    }
    if (!this.buf) {
      throw new Error("buffer lost somehow in ONDRAIN");
    }
    if (this.offset >= this.length) {
      this.buf = Buffer.allocUnsafe(Math.min(this.blockRemain, this.buf.length));
      this.offset = 0;
    }
    this.length = this.buf.length - this.offset;
    this[READ]();
  }
}
class WriteEntrySync extends WriteEntry {
  sync = true;
  [LSTAT]() {
    this[ONLSTAT](fs.lstatSync(this.absolute));
  }
  [SYMLINK$1]() {
    this[ONREADLINK](fs.readlinkSync(this.absolute));
  }
  [OPENFILE]() {
    this[ONOPENFILE](fs.openSync(this.absolute, "r"));
  }
  [READ]() {
    let threw = true;
    try {
      const { fd, buf, offset, length, pos: pos2 } = this;
      if (fd === void 0 || buf === void 0) {
        throw new Error("fd and buf must be set in READ method");
      }
      const bytesRead = fs.readSync(fd, buf, offset, length, pos2);
      this[ONREAD](bytesRead);
      threw = false;
    } finally {
      if (threw) {
        try {
          this[CLOSE](() => {
          });
        } catch (er) {
        }
      }
    }
  }
  [AWAITDRAIN](cb) {
    cb();
  }
  /* c8 ignore start */
  [CLOSE](cb = () => {
  }) {
    if (this.fd !== void 0)
      fs.closeSync(this.fd);
    cb();
  }
}
class WriteEntryTar extends Minipass {
  blockLen = 0;
  blockRemain = 0;
  buf = 0;
  pos = 0;
  remain = 0;
  length = 0;
  preservePaths;
  portable;
  strict;
  noPax;
  noMtime;
  readEntry;
  type;
  prefix;
  path;
  mode;
  uid;
  gid;
  uname;
  gname;
  header;
  mtime;
  atime;
  ctime;
  linkpath;
  size;
  onWriteEntry;
  warn(code2, message, data = {}) {
    return warnMethod(this, code2, message, data);
  }
  constructor(readEntry, opt_ = {}) {
    const opt = dealias(opt_);
    super();
    this.preservePaths = !!opt.preservePaths;
    this.portable = !!opt.portable;
    this.strict = !!opt.strict;
    this.noPax = !!opt.noPax;
    this.noMtime = !!opt.noMtime;
    this.onWriteEntry = opt.onWriteEntry;
    this.readEntry = readEntry;
    const { type } = readEntry;
    if (type === "Unsupported") {
      throw new Error("writing entry that should be ignored");
    }
    this.type = type;
    if (this.type === "Directory" && this.portable) {
      this.noMtime = true;
    }
    this.prefix = opt.prefix;
    this.path = normalizeWindowsPath(readEntry.path);
    this.mode = readEntry.mode !== void 0 ? this[MODE](readEntry.mode) : void 0;
    this.uid = this.portable ? void 0 : readEntry.uid;
    this.gid = this.portable ? void 0 : readEntry.gid;
    this.uname = this.portable ? void 0 : readEntry.uname;
    this.gname = this.portable ? void 0 : readEntry.gname;
    this.size = readEntry.size;
    this.mtime = this.noMtime ? void 0 : opt.mtime || readEntry.mtime;
    this.atime = this.portable ? void 0 : readEntry.atime;
    this.ctime = this.portable ? void 0 : readEntry.ctime;
    this.linkpath = readEntry.linkpath !== void 0 ? normalizeWindowsPath(readEntry.linkpath) : void 0;
    if (typeof opt.onwarn === "function") {
      this.on("warn", opt.onwarn);
    }
    let pathWarn = false;
    if (!this.preservePaths) {
      const [root, stripped] = stripAbsolutePath(this.path);
      if (root && typeof stripped === "string") {
        this.path = stripped;
        pathWarn = root;
      }
    }
    this.remain = readEntry.size;
    this.blockRemain = readEntry.startBlockSize;
    this.onWriteEntry?.(this);
    this.header = new Header({
      path: this[PREFIX](this.path),
      linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[PREFIX](this.linkpath) : this.linkpath,
      // only the permissions and setuid/setgid/sticky bitflags
      // not the higher-order bits that specify file type
      mode: this.mode,
      uid: this.portable ? void 0 : this.uid,
      gid: this.portable ? void 0 : this.gid,
      size: this.size,
      mtime: this.noMtime ? void 0 : this.mtime,
      type: this.type,
      uname: this.portable ? void 0 : this.uname,
      atime: this.portable ? void 0 : this.atime,
      ctime: this.portable ? void 0 : this.ctime
    });
    if (pathWarn) {
      this.warn("TAR_ENTRY_INFO", `stripping ${pathWarn} from absolute path`, {
        entry: this,
        path: pathWarn + this.path
      });
    }
    if (this.header.encode() && !this.noPax) {
      super.write(new Pax({
        atime: this.portable ? void 0 : this.atime,
        ctime: this.portable ? void 0 : this.ctime,
        gid: this.portable ? void 0 : this.gid,
        mtime: this.noMtime ? void 0 : this.mtime,
        path: this[PREFIX](this.path),
        linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[PREFIX](this.linkpath) : this.linkpath,
        size: this.size,
        uid: this.portable ? void 0 : this.uid,
        uname: this.portable ? void 0 : this.uname,
        dev: this.portable ? void 0 : this.readEntry.dev,
        ino: this.portable ? void 0 : this.readEntry.ino,
        nlink: this.portable ? void 0 : this.readEntry.nlink
      }).encode());
    }
    const b = this.header?.block;
    if (!b)
      throw new Error("failed to encode header");
    super.write(b);
    readEntry.pipe(this);
  }
  [PREFIX](path2) {
    return prefixPath(path2, this.prefix);
  }
  [MODE](mode) {
    return modeFix(mode, this.type === "Directory", this.portable);
  }
  write(chunk, encoding, cb) {
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
    }
    const writeLen = chunk.length;
    if (writeLen > this.blockRemain) {
      throw new Error("writing more to entry than is appropriate");
    }
    this.blockRemain -= writeLen;
    return super.write(chunk, cb);
  }
  end(chunk, encoding, cb) {
    if (this.blockRemain) {
      super.write(Buffer.alloc(this.blockRemain));
    }
    if (typeof chunk === "function") {
      cb = chunk;
      encoding = void 0;
      chunk = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, encoding ?? "utf8");
    }
    if (cb)
      this.once("finish", cb);
    chunk ? super.end(chunk, cb) : super.end(cb);
    return this;
  }
}
const getType = (stat) => stat.isFile() ? "File" : stat.isDirectory() ? "Directory" : stat.isSymbolicLink() ? "SymbolicLink" : "Unsupported";
class Yallist {
  tail;
  head;
  length = 0;
  static create(list2 = []) {
    return new Yallist(list2);
  }
  constructor(list2 = []) {
    for (const item of list2) {
      this.push(item);
    }
  }
  *[Symbol.iterator]() {
    for (let walker = this.head; walker; walker = walker.next) {
      yield walker.value;
    }
  }
  removeNode(node) {
    if (node.list !== this) {
      throw new Error("removing node which does not belong to this list");
    }
    const next = node.next;
    const prev = node.prev;
    if (next) {
      next.prev = prev;
    }
    if (prev) {
      prev.next = next;
    }
    if (node === this.head) {
      this.head = next;
    }
    if (node === this.tail) {
      this.tail = prev;
    }
    this.length--;
    node.next = void 0;
    node.prev = void 0;
    node.list = void 0;
    return next;
  }
  unshiftNode(node) {
    if (node === this.head) {
      return;
    }
    if (node.list) {
      node.list.removeNode(node);
    }
    const head = this.head;
    node.list = this;
    node.next = head;
    if (head) {
      head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
    this.length++;
  }
  pushNode(node) {
    if (node === this.tail) {
      return;
    }
    if (node.list) {
      node.list.removeNode(node);
    }
    const tail = this.tail;
    node.list = this;
    node.prev = tail;
    if (tail) {
      tail.next = node;
    }
    this.tail = node;
    if (!this.head) {
      this.head = node;
    }
    this.length++;
  }
  push(...args) {
    for (let i = 0, l = args.length; i < l; i++) {
      push(this, args[i]);
    }
    return this.length;
  }
  unshift(...args) {
    for (var i = 0, l = args.length; i < l; i++) {
      unshift(this, args[i]);
    }
    return this.length;
  }
  pop() {
    if (!this.tail) {
      return void 0;
    }
    const res = this.tail.value;
    const t = this.tail;
    this.tail = this.tail.prev;
    if (this.tail) {
      this.tail.next = void 0;
    } else {
      this.head = void 0;
    }
    t.list = void 0;
    this.length--;
    return res;
  }
  shift() {
    if (!this.head) {
      return void 0;
    }
    const res = this.head.value;
    const h = this.head;
    this.head = this.head.next;
    if (this.head) {
      this.head.prev = void 0;
    } else {
      this.tail = void 0;
    }
    h.list = void 0;
    this.length--;
    return res;
  }
  forEach(fn, thisp) {
    thisp = thisp || this;
    for (let walker = this.head, i = 0; !!walker; i++) {
      fn.call(thisp, walker.value, i, this);
      walker = walker.next;
    }
  }
  forEachReverse(fn, thisp) {
    thisp = thisp || this;
    for (let walker = this.tail, i = this.length - 1; !!walker; i--) {
      fn.call(thisp, walker.value, i, this);
      walker = walker.prev;
    }
  }
  get(n) {
    let i = 0;
    let walker = this.head;
    for (; !!walker && i < n; i++) {
      walker = walker.next;
    }
    if (i === n && !!walker) {
      return walker.value;
    }
  }
  getReverse(n) {
    let i = 0;
    let walker = this.tail;
    for (; !!walker && i < n; i++) {
      walker = walker.prev;
    }
    if (i === n && !!walker) {
      return walker.value;
    }
  }
  map(fn, thisp) {
    thisp = thisp || this;
    const res = new Yallist();
    for (let walker = this.head; !!walker; ) {
      res.push(fn.call(thisp, walker.value, this));
      walker = walker.next;
    }
    return res;
  }
  mapReverse(fn, thisp) {
    thisp = thisp || this;
    var res = new Yallist();
    for (let walker = this.tail; !!walker; ) {
      res.push(fn.call(thisp, walker.value, this));
      walker = walker.prev;
    }
    return res;
  }
  reduce(fn, initial) {
    let acc;
    let walker = this.head;
    if (arguments.length > 1) {
      acc = initial;
    } else if (this.head) {
      walker = this.head.next;
      acc = this.head.value;
    } else {
      throw new TypeError("Reduce of empty list with no initial value");
    }
    for (var i = 0; !!walker; i++) {
      acc = fn(acc, walker.value, i);
      walker = walker.next;
    }
    return acc;
  }
  reduceReverse(fn, initial) {
    let acc;
    let walker = this.tail;
    if (arguments.length > 1) {
      acc = initial;
    } else if (this.tail) {
      walker = this.tail.prev;
      acc = this.tail.value;
    } else {
      throw new TypeError("Reduce of empty list with no initial value");
    }
    for (let i = this.length - 1; !!walker; i--) {
      acc = fn(acc, walker.value, i);
      walker = walker.prev;
    }
    return acc;
  }
  toArray() {
    const arr = new Array(this.length);
    for (let i = 0, walker = this.head; !!walker; i++) {
      arr[i] = walker.value;
      walker = walker.next;
    }
    return arr;
  }
  toArrayReverse() {
    const arr = new Array(this.length);
    for (let i = 0, walker = this.tail; !!walker; i++) {
      arr[i] = walker.value;
      walker = walker.prev;
    }
    return arr;
  }
  slice(from = 0, to = this.length) {
    if (to < 0) {
      to += this.length;
    }
    if (from < 0) {
      from += this.length;
    }
    const ret = new Yallist();
    if (to < from || to < 0) {
      return ret;
    }
    if (from < 0) {
      from = 0;
    }
    if (to > this.length) {
      to = this.length;
    }
    let walker = this.head;
    let i = 0;
    for (i = 0; !!walker && i < from; i++) {
      walker = walker.next;
    }
    for (; !!walker && i < to; i++, walker = walker.next) {
      ret.push(walker.value);
    }
    return ret;
  }
  sliceReverse(from = 0, to = this.length) {
    if (to < 0) {
      to += this.length;
    }
    if (from < 0) {
      from += this.length;
    }
    const ret = new Yallist();
    if (to < from || to < 0) {
      return ret;
    }
    if (from < 0) {
      from = 0;
    }
    if (to > this.length) {
      to = this.length;
    }
    let i = this.length;
    let walker = this.tail;
    for (; !!walker && i > to; i--) {
      walker = walker.prev;
    }
    for (; !!walker && i > from; i--, walker = walker.prev) {
      ret.push(walker.value);
    }
    return ret;
  }
  splice(start, deleteCount = 0, ...nodes) {
    if (start > this.length) {
      start = this.length - 1;
    }
    if (start < 0) {
      start = this.length + start;
    }
    let walker = this.head;
    for (let i = 0; !!walker && i < start; i++) {
      walker = walker.next;
    }
    const ret = [];
    for (let i = 0; !!walker && i < deleteCount; i++) {
      ret.push(walker.value);
      walker = this.removeNode(walker);
    }
    if (!walker) {
      walker = this.tail;
    } else if (walker !== this.tail) {
      walker = walker.prev;
    }
    for (const v of nodes) {
      walker = insertAfter(this, walker, v);
    }
    return ret;
  }
  reverse() {
    const head = this.head;
    const tail = this.tail;
    for (let walker = head; !!walker; walker = walker.prev) {
      const p = walker.prev;
      walker.prev = walker.next;
      walker.next = p;
    }
    this.head = tail;
    this.tail = head;
    return this;
  }
}
function insertAfter(self, node, value) {
  const prev = node;
  const next = node ? node.next : self.head;
  const inserted = new Node(value, prev, next, self);
  if (inserted.next === void 0) {
    self.tail = inserted;
  }
  if (inserted.prev === void 0) {
    self.head = inserted;
  }
  self.length++;
  return inserted;
}
function push(self, item) {
  self.tail = new Node(item, self.tail, void 0, self);
  if (!self.head) {
    self.head = self.tail;
  }
  self.length++;
}
function unshift(self, item) {
  self.head = new Node(item, void 0, self.head, self);
  if (!self.tail) {
    self.tail = self.head;
  }
  self.length++;
}
class Node {
  list;
  next;
  prev;
  value;
  constructor(value, prev, next, list2) {
    this.list = list2;
    this.value = value;
    if (prev) {
      prev.next = this;
      this.prev = prev;
    } else {
      this.prev = void 0;
    }
    if (next) {
      next.prev = this;
      this.next = next;
    } else {
      this.next = void 0;
    }
  }
}
class PackJob {
  path;
  absolute;
  entry;
  stat;
  readdir;
  pending = false;
  ignore = false;
  piped = false;
  constructor(path2, absolute) {
    this.path = path2 || "./";
    this.absolute = absolute;
  }
}
const EOF = Buffer.alloc(1024);
const ONSTAT = Symbol("onStat");
const ENDED$1 = Symbol("ended");
const QUEUE = Symbol("queue");
const CURRENT = Symbol("current");
const PROCESS = Symbol("process");
const PROCESSING = Symbol("processing");
const PROCESSJOB = Symbol("processJob");
const JOBS = Symbol("jobs");
const JOBDONE = Symbol("jobDone");
const ADDFSENTRY = Symbol("addFSEntry");
const ADDTARENTRY = Symbol("addTarEntry");
const STAT = Symbol("stat");
const READDIR = Symbol("readdir");
const ONREADDIR = Symbol("onreaddir");
const PIPE = Symbol("pipe");
const ENTRY = Symbol("entry");
const ENTRYOPT = Symbol("entryOpt");
const WRITEENTRYCLASS = Symbol("writeEntryClass");
const WRITE = Symbol("write");
const ONDRAIN = Symbol("ondrain");
class Pack extends Minipass {
  opt;
  cwd;
  maxReadSize;
  preservePaths;
  strict;
  noPax;
  prefix;
  linkCache;
  statCache;
  file;
  portable;
  zip;
  readdirCache;
  noDirRecurse;
  follow;
  noMtime;
  mtime;
  filter;
  jobs;
  [WRITEENTRYCLASS];
  onWriteEntry;
  // Note: we actually DO need a linked list here, because we
  // shift() to update the head of the list where we start, but still
  // while that happens, need to know what the next item in the queue
  // will be. Since we do multiple jobs in parallel, it's not as simple
  // as just an Array.shift(), since that would lose the information about
  // the next job in the list. We could add a .next field on the PackJob
  // class, but then we'd have to be tracking the tail of the queue the
  // whole time, and Yallist just does that for us anyway.
  [QUEUE];
  [JOBS] = 0;
  [PROCESSING] = false;
  [ENDED$1] = false;
  constructor(opt = {}) {
    super();
    this.opt = opt;
    this.file = opt.file || "";
    this.cwd = opt.cwd || process.cwd();
    this.maxReadSize = opt.maxReadSize;
    this.preservePaths = !!opt.preservePaths;
    this.strict = !!opt.strict;
    this.noPax = !!opt.noPax;
    this.prefix = normalizeWindowsPath(opt.prefix || "");
    this.linkCache = opt.linkCache || /* @__PURE__ */ new Map();
    this.statCache = opt.statCache || /* @__PURE__ */ new Map();
    this.readdirCache = opt.readdirCache || /* @__PURE__ */ new Map();
    this.onWriteEntry = opt.onWriteEntry;
    this[WRITEENTRYCLASS] = WriteEntry;
    if (typeof opt.onwarn === "function") {
      this.on("warn", opt.onwarn);
    }
    this.portable = !!opt.portable;
    if (opt.gzip || opt.brotli || opt.zstd) {
      if ((opt.gzip ? 1 : 0) + (opt.brotli ? 1 : 0) + (opt.zstd ? 1 : 0) > 1) {
        throw new TypeError("gzip, brotli, zstd are mutually exclusive");
      }
      if (opt.gzip) {
        if (typeof opt.gzip !== "object") {
          opt.gzip = {};
        }
        if (this.portable) {
          opt.gzip.portable = true;
        }
        this.zip = new Gzip(opt.gzip);
      }
      if (opt.brotli) {
        if (typeof opt.brotli !== "object") {
          opt.brotli = {};
        }
        this.zip = new BrotliCompress(opt.brotli);
      }
      if (opt.zstd) {
        if (typeof opt.zstd !== "object") {
          opt.zstd = {};
        }
        this.zip = new ZstdCompress(opt.zstd);
      }
      if (!this.zip)
        throw new Error("impossible");
      const zip = this.zip;
      zip.on("data", (chunk) => super.write(chunk));
      zip.on("end", () => super.end());
      zip.on("drain", () => this[ONDRAIN]());
      this.on("resume", () => zip.resume());
    } else {
      this.on("drain", this[ONDRAIN]);
    }
    this.noDirRecurse = !!opt.noDirRecurse;
    this.follow = !!opt.follow;
    this.noMtime = !!opt.noMtime;
    if (opt.mtime)
      this.mtime = opt.mtime;
    this.filter = typeof opt.filter === "function" ? opt.filter : () => true;
    this[QUEUE] = new Yallist();
    this[JOBS] = 0;
    this.jobs = Number(opt.jobs) || 4;
    this[PROCESSING] = false;
    this[ENDED$1] = false;
  }
  [WRITE](chunk) {
    return super.write(chunk);
  }
  add(path2) {
    this.write(path2);
    return this;
  }
  end(path2, encoding, cb) {
    if (typeof path2 === "function") {
      cb = path2;
      path2 = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = void 0;
    }
    if (path2) {
      this.add(path2);
    }
    this[ENDED$1] = true;
    this[PROCESS]();
    if (cb)
      cb();
    return this;
  }
  write(path2) {
    if (this[ENDED$1]) {
      throw new Error("write after end");
    }
    if (path2 instanceof ReadEntry) {
      this[ADDTARENTRY](path2);
    } else {
      this[ADDFSENTRY](path2);
    }
    return this.flowing;
  }
  [ADDTARENTRY](p) {
    const absolute = normalizeWindowsPath(path.resolve(this.cwd, p.path));
    if (!this.filter(p.path, p)) {
      p.resume();
    } else {
      const job = new PackJob(p.path, absolute);
      job.entry = new WriteEntryTar(p, this[ENTRYOPT](job));
      job.entry.on("end", () => this[JOBDONE](job));
      this[JOBS] += 1;
      this[QUEUE].push(job);
    }
    this[PROCESS]();
  }
  [ADDFSENTRY](p) {
    const absolute = normalizeWindowsPath(path.resolve(this.cwd, p));
    this[QUEUE].push(new PackJob(p, absolute));
    this[PROCESS]();
  }
  [STAT](job) {
    job.pending = true;
    this[JOBS] += 1;
    const stat = this.follow ? "stat" : "lstat";
    fs[stat](job.absolute, (er, stat2) => {
      job.pending = false;
      this[JOBS] -= 1;
      if (er) {
        this.emit("error", er);
      } else {
        this[ONSTAT](job, stat2);
      }
    });
  }
  [ONSTAT](job, stat) {
    this.statCache.set(job.absolute, stat);
    job.stat = stat;
    if (!this.filter(job.path, stat)) {
      job.ignore = true;
    }
    this[PROCESS]();
  }
  [READDIR](job) {
    job.pending = true;
    this[JOBS] += 1;
    fs.readdir(job.absolute, (er, entries) => {
      job.pending = false;
      this[JOBS] -= 1;
      if (er) {
        return this.emit("error", er);
      }
      this[ONREADDIR](job, entries);
    });
  }
  [ONREADDIR](job, entries) {
    this.readdirCache.set(job.absolute, entries);
    job.readdir = entries;
    this[PROCESS]();
  }
  [PROCESS]() {
    if (this[PROCESSING]) {
      return;
    }
    this[PROCESSING] = true;
    for (let w = this[QUEUE].head; !!w && this[JOBS] < this.jobs; w = w.next) {
      this[PROCESSJOB](w.value);
      if (w.value.ignore) {
        const p = w.next;
        this[QUEUE].removeNode(w);
        w.next = p;
      }
    }
    this[PROCESSING] = false;
    if (this[ENDED$1] && !this[QUEUE].length && this[JOBS] === 0) {
      if (this.zip) {
        this.zip.end(EOF);
      } else {
        super.write(EOF);
        super.end();
      }
    }
  }
  get [CURRENT]() {
    return this[QUEUE] && this[QUEUE].head && this[QUEUE].head.value;
  }
  [JOBDONE](_job) {
    this[QUEUE].shift();
    this[JOBS] -= 1;
    this[PROCESS]();
  }
  [PROCESSJOB](job) {
    if (job.pending) {
      return;
    }
    if (job.entry) {
      if (job === this[CURRENT] && !job.piped) {
        this[PIPE](job);
      }
      return;
    }
    if (!job.stat) {
      const sc = this.statCache.get(job.absolute);
      if (sc) {
        this[ONSTAT](job, sc);
      } else {
        this[STAT](job);
      }
    }
    if (!job.stat) {
      return;
    }
    if (job.ignore) {
      return;
    }
    if (!this.noDirRecurse && job.stat.isDirectory() && !job.readdir) {
      const rc = this.readdirCache.get(job.absolute);
      if (rc) {
        this[ONREADDIR](job, rc);
      } else {
        this[READDIR](job);
      }
      if (!job.readdir) {
        return;
      }
    }
    job.entry = this[ENTRY](job);
    if (!job.entry) {
      job.ignore = true;
      return;
    }
    if (job === this[CURRENT] && !job.piped) {
      this[PIPE](job);
    }
  }
  [ENTRYOPT](job) {
    return {
      onwarn: (code2, msg, data) => this.warn(code2, msg, data),
      noPax: this.noPax,
      cwd: this.cwd,
      absolute: job.absolute,
      preservePaths: this.preservePaths,
      maxReadSize: this.maxReadSize,
      strict: this.strict,
      portable: this.portable,
      linkCache: this.linkCache,
      statCache: this.statCache,
      noMtime: this.noMtime,
      mtime: this.mtime,
      prefix: this.prefix,
      onWriteEntry: this.onWriteEntry
    };
  }
  [ENTRY](job) {
    this[JOBS] += 1;
    try {
      const e = new this[WRITEENTRYCLASS](job.path, this[ENTRYOPT](job));
      return e.on("end", () => this[JOBDONE](job)).on("error", (er) => this.emit("error", er));
    } catch (er) {
      this.emit("error", er);
    }
  }
  [ONDRAIN]() {
    if (this[CURRENT] && this[CURRENT].entry) {
      this[CURRENT].entry.resume();
    }
  }
  // like .pipe() but using super, because our write() is special
  [PIPE](job) {
    job.piped = true;
    if (job.readdir) {
      job.readdir.forEach((entry) => {
        const p = job.path;
        const base = p === "./" ? "" : p.replace(/\/*$/, "/");
        this[ADDFSENTRY](base + entry);
      });
    }
    const source = job.entry;
    const zip = this.zip;
    if (!source)
      throw new Error("cannot pipe without source");
    if (zip) {
      source.on("data", (chunk) => {
        if (!zip.write(chunk)) {
          source.pause();
        }
      });
    } else {
      source.on("data", (chunk) => {
        if (!super.write(chunk)) {
          source.pause();
        }
      });
    }
  }
  pause() {
    if (this.zip) {
      this.zip.pause();
    }
    return super.pause();
  }
  warn(code2, message, data = {}) {
    warnMethod(this, code2, message, data);
  }
}
class PackSync extends Pack {
  sync = true;
  constructor(opt) {
    super(opt);
    this[WRITEENTRYCLASS] = WriteEntrySync;
  }
  // pause/resume are no-ops in sync streams.
  pause() {
  }
  resume() {
  }
  [STAT](job) {
    const stat = this.follow ? "statSync" : "lstatSync";
    this[ONSTAT](job, fs[stat](job.absolute));
  }
  [READDIR](job) {
    this[ONREADDIR](job, fs.readdirSync(job.absolute));
  }
  // gotta get it all in this tick
  [PIPE](job) {
    const source = job.entry;
    const zip = this.zip;
    if (job.readdir) {
      job.readdir.forEach((entry) => {
        const p = job.path;
        const base = p === "./" ? "" : p.replace(/\/*$/, "/");
        this[ADDFSENTRY](base + entry);
      });
    }
    if (!source)
      throw new Error("Cannot pipe without source");
    if (zip) {
      source.on("data", (chunk) => {
        zip.write(chunk);
      });
    } else {
      source.on("data", (chunk) => {
        super[WRITE](chunk);
      });
    }
  }
}
const createFileSync = (opt, files) => {
  const p = new PackSync(opt);
  const stream = new WriteStreamSync(opt.file, {
    mode: opt.mode || 438
  });
  p.pipe(stream);
  addFilesSync$1(p, files);
};
const createFile = (opt, files) => {
  const p = new Pack(opt);
  const stream = new WriteStream(opt.file, {
    mode: opt.mode || 438
  });
  p.pipe(stream);
  const promise = new Promise((res, rej) => {
    stream.on("error", rej);
    stream.on("close", res);
    p.on("error", rej);
  });
  addFilesAsync$1(p, files);
  return promise;
};
const addFilesSync$1 = (p, files) => {
  files.forEach((file) => {
    if (file.charAt(0) === "@") {
      list({
        file: path$1.resolve(p.cwd, file.slice(1)),
        sync: true,
        noResume: true,
        onReadEntry: (entry) => p.add(entry)
      });
    } else {
      p.add(file);
    }
  });
  p.end();
};
const addFilesAsync$1 = async (p, files) => {
  for (let i = 0; i < files.length; i++) {
    const file = String(files[i]);
    if (file.charAt(0) === "@") {
      await list({
        file: path$1.resolve(String(p.cwd), file.slice(1)),
        noResume: true,
        onReadEntry: (entry) => {
          p.add(entry);
        }
      });
    } else {
      p.add(file);
    }
  }
  p.end();
};
const createSync = (opt, files) => {
  const p = new PackSync(opt);
  addFilesSync$1(p, files);
  return p;
};
const createAsync = (opt, files) => {
  const p = new Pack(opt);
  addFilesAsync$1(p, files);
  return p;
};
makeCommand(createFileSync, createFile, createSync, createAsync, (_opt, files) => {
  if (!files?.length) {
    throw new TypeError("no paths specified to add to archive");
  }
});
const platform$2 = process.env.__FAKE_PLATFORM__ || process.platform;
const isWindows$2 = platform$2 === "win32";
const { O_CREAT, O_TRUNC, O_WRONLY } = fs.constants;
const UV_FS_O_FILEMAP = Number(process.env.__FAKE_FS_O_FILENAME__) || fs.constants.UV_FS_O_FILEMAP || 0;
const fMapEnabled = isWindows$2 && !!UV_FS_O_FILEMAP;
const fMapLimit = 512 * 1024;
const fMapFlag = UV_FS_O_FILEMAP | O_TRUNC | O_CREAT | O_WRONLY;
const getWriteFlag = !fMapEnabled ? () => "w" : (size) => size < fMapLimit ? fMapFlag : "w";
const lchownSync = (path2, uid, gid) => {
  try {
    return fs$1.lchownSync(path2, uid, gid);
  } catch (er) {
    if (er?.code !== "ENOENT")
      throw er;
  }
};
const chown = (cpath, uid, gid, cb) => {
  fs$1.lchown(cpath, uid, gid, (er) => {
    cb(er && er?.code !== "ENOENT" ? er : null);
  });
};
const chownrKid = (p, child, uid, gid, cb) => {
  if (child.isDirectory()) {
    chownr(path$1.resolve(p, child.name), uid, gid, (er) => {
      if (er)
        return cb(er);
      const cpath = path$1.resolve(p, child.name);
      chown(cpath, uid, gid, cb);
    });
  } else {
    const cpath = path$1.resolve(p, child.name);
    chown(cpath, uid, gid, cb);
  }
};
const chownr = (p, uid, gid, cb) => {
  fs$1.readdir(p, { withFileTypes: true }, (er, children) => {
    if (er) {
      if (er.code === "ENOENT")
        return cb();
      else if (er.code !== "ENOTDIR" && er.code !== "ENOTSUP")
        return cb(er);
    }
    if (er || !children.length)
      return chown(p, uid, gid, cb);
    let len = children.length;
    let errState = null;
    const then = (er2) => {
      if (errState)
        return;
      if (er2)
        return cb(errState = er2);
      if (--len === 0)
        return chown(p, uid, gid, cb);
    };
    for (const child of children) {
      chownrKid(p, child, uid, gid, then);
    }
  });
};
const chownrKidSync = (p, child, uid, gid) => {
  if (child.isDirectory())
    chownrSync(path$1.resolve(p, child.name), uid, gid);
  lchownSync(path$1.resolve(p, child.name), uid, gid);
};
const chownrSync = (p, uid, gid) => {
  let children;
  try {
    children = fs$1.readdirSync(p, { withFileTypes: true });
  } catch (er) {
    const e = er;
    if (e?.code === "ENOENT")
      return;
    else if (e?.code === "ENOTDIR" || e?.code === "ENOTSUP")
      return lchownSync(p, uid, gid);
    else
      throw e;
  }
  for (const child of children) {
    chownrKidSync(p, child, uid, gid);
  }
  return lchownSync(p, uid, gid);
};
class CwdError extends Error {
  path;
  code;
  syscall = "chdir";
  constructor(path2, code2) {
    super(`${code2}: Cannot cd into '${path2}'`);
    this.path = path2;
    this.code = code2;
  }
  get name() {
    return "CwdError";
  }
}
class SymlinkError extends Error {
  path;
  symlink;
  syscall = "symlink";
  code = "TAR_SYMLINK_ERROR";
  constructor(symlink, path2) {
    super("TAR_SYMLINK_ERROR: Cannot extract through symbolic link");
    this.symlink = symlink;
    this.path = path2;
  }
  get name() {
    return "SymlinkError";
  }
}
const checkCwd = (dir, cb) => {
  fs$1.stat(dir, (er, st) => {
    if (er || !st.isDirectory()) {
      er = new CwdError(dir, er?.code || "ENOTDIR");
    }
    cb(er);
  });
};
const mkdir = (dir, opt, cb) => {
  dir = normalizeWindowsPath(dir);
  const umask = opt.umask ?? 18;
  const mode = opt.mode | 448;
  const needChmod = (mode & umask) !== 0;
  const uid = opt.uid;
  const gid = opt.gid;
  const doChown = typeof uid === "number" && typeof gid === "number" && (uid !== opt.processUid || gid !== opt.processGid);
  const preserve = opt.preserve;
  const unlink = opt.unlink;
  const cwd = normalizeWindowsPath(opt.cwd);
  const done = (er, created) => {
    if (er) {
      cb(er);
    } else {
      if (created && doChown) {
        chownr(created, uid, gid, (er2) => done(er2));
      } else if (needChmod) {
        fs$1.chmod(dir, mode, cb);
      } else {
        cb();
      }
    }
  };
  if (dir === cwd) {
    return checkCwd(dir, done);
  }
  if (preserve) {
    return fsp.mkdir(dir, { mode, recursive: true }).then(
      (made) => done(null, made ?? void 0),
      // oh, ts
      done
    );
  }
  const sub = normalizeWindowsPath(path$1.relative(cwd, dir));
  const parts = sub.split("/");
  mkdir_(cwd, parts, mode, unlink, cwd, void 0, done);
};
const mkdir_ = (base, parts, mode, unlink, cwd, created, cb) => {
  if (!parts.length) {
    return cb(null, created);
  }
  const p = parts.shift();
  const part = normalizeWindowsPath(path$1.resolve(base + "/" + p));
  fs$1.mkdir(part, mode, onmkdir(part, parts, mode, unlink, cwd, created, cb));
};
const onmkdir = (part, parts, mode, unlink, cwd, created, cb) => (er) => {
  if (er) {
    fs$1.lstat(part, (statEr, st) => {
      if (statEr) {
        statEr.path = statEr.path && normalizeWindowsPath(statEr.path);
        cb(statEr);
      } else if (st.isDirectory()) {
        mkdir_(part, parts, mode, unlink, cwd, created, cb);
      } else if (unlink) {
        fs$1.unlink(part, (er2) => {
          if (er2) {
            return cb(er2);
          }
          fs$1.mkdir(part, mode, onmkdir(part, parts, mode, unlink, cwd, created, cb));
        });
      } else if (st.isSymbolicLink()) {
        return cb(new SymlinkError(part, part + "/" + parts.join("/")));
      } else {
        cb(er);
      }
    });
  } else {
    created = created || part;
    mkdir_(part, parts, mode, unlink, cwd, created, cb);
  }
};
const checkCwdSync = (dir) => {
  let ok = false;
  let code2 = void 0;
  try {
    ok = fs$1.statSync(dir).isDirectory();
  } catch (er) {
    code2 = er?.code;
  } finally {
    if (!ok) {
      throw new CwdError(dir, code2 ?? "ENOTDIR");
    }
  }
};
const mkdirSync = (dir, opt) => {
  dir = normalizeWindowsPath(dir);
  const umask = opt.umask ?? 18;
  const mode = opt.mode | 448;
  const needChmod = (mode & umask) !== 0;
  const uid = opt.uid;
  const gid = opt.gid;
  const doChown = typeof uid === "number" && typeof gid === "number" && (uid !== opt.processUid || gid !== opt.processGid);
  const preserve = opt.preserve;
  const unlink = opt.unlink;
  const cwd = normalizeWindowsPath(opt.cwd);
  const done = (created2) => {
    if (created2 && doChown) {
      chownrSync(created2, uid, gid);
    }
    if (needChmod) {
      fs$1.chmodSync(dir, mode);
    }
  };
  if (dir === cwd) {
    checkCwdSync(cwd);
    return done();
  }
  if (preserve) {
    return done(fs$1.mkdirSync(dir, { mode, recursive: true }) ?? void 0);
  }
  const sub = normalizeWindowsPath(path$1.relative(cwd, dir));
  const parts = sub.split("/");
  let created = void 0;
  for (let p = parts.shift(), part = cwd; p && (part += "/" + p); p = parts.shift()) {
    part = normalizeWindowsPath(path$1.resolve(part));
    try {
      fs$1.mkdirSync(part, mode);
      created = created || part;
    } catch (er) {
      const st = fs$1.lstatSync(part);
      if (st.isDirectory()) {
        continue;
      } else if (unlink) {
        fs$1.unlinkSync(part);
        fs$1.mkdirSync(part, mode);
        created = created || part;
        continue;
      } else if (st.isSymbolicLink()) {
        return new SymlinkError(part, part + "/" + parts.join("/"));
      }
    }
  }
  return done(created);
};
const normalizeCache = /* @__PURE__ */ Object.create(null);
const MAX = 1e4;
const cache = /* @__PURE__ */ new Set();
const normalizeUnicode = (s) => {
  if (!cache.has(s)) {
    normalizeCache[s] = s.normalize("NFD");
  } else {
    cache.delete(s);
  }
  cache.add(s);
  const ret = normalizeCache[s];
  let i = cache.size - MAX;
  if (i > MAX / 10) {
    for (const s2 of cache) {
      cache.delete(s2);
      delete normalizeCache[s2];
      if (--i <= 0)
        break;
    }
  }
  return ret;
};
const platform$1 = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
const isWindows$1 = platform$1 === "win32";
const getDirs = (path2) => {
  const dirs = path2.split("/").slice(0, -1).reduce((set, path22) => {
    const s = set[set.length - 1];
    if (s !== void 0) {
      path22 = join(s, path22);
    }
    set.push(path22 || "/");
    return set;
  }, []);
  return dirs;
};
class PathReservations {
  // path => [function or Set]
  // A Set object means a directory reservation
  // A fn is a direct reservation on that path
  #queues = /* @__PURE__ */ new Map();
  // fn => {paths:[path,...], dirs:[path, ...]}
  #reservations = /* @__PURE__ */ new Map();
  // functions currently running
  #running = /* @__PURE__ */ new Set();
  reserve(paths, fn) {
    paths = isWindows$1 ? ["win32 parallelization disabled"] : paths.map((p) => {
      return stripTrailingSlashes(join(normalizeUnicode(p))).toLowerCase();
    });
    const dirs = new Set(paths.map((path2) => getDirs(path2)).reduce((a, b) => a.concat(b)));
    this.#reservations.set(fn, { dirs, paths });
    for (const p of paths) {
      const q = this.#queues.get(p);
      if (!q) {
        this.#queues.set(p, [fn]);
      } else {
        q.push(fn);
      }
    }
    for (const dir of dirs) {
      const q = this.#queues.get(dir);
      if (!q) {
        this.#queues.set(dir, [/* @__PURE__ */ new Set([fn])]);
      } else {
        const l = q[q.length - 1];
        if (l instanceof Set) {
          l.add(fn);
        } else {
          q.push(/* @__PURE__ */ new Set([fn]));
        }
      }
    }
    return this.#run(fn);
  }
  // return the queues for each path the function cares about
  // fn => {paths, dirs}
  #getQueues(fn) {
    const res = this.#reservations.get(fn);
    if (!res) {
      throw new Error("function does not have any path reservations");
    }
    return {
      paths: res.paths.map((path2) => this.#queues.get(path2)),
      dirs: [...res.dirs].map((path2) => this.#queues.get(path2))
    };
  }
  // check if fn is first in line for all its paths, and is
  // included in the first set for all its dir queues
  check(fn) {
    const { paths, dirs } = this.#getQueues(fn);
    return paths.every((q) => q && q[0] === fn) && dirs.every((q) => q && q[0] instanceof Set && q[0].has(fn));
  }
  // run the function if it's first in line and not already running
  #run(fn) {
    if (this.#running.has(fn) || !this.check(fn)) {
      return false;
    }
    this.#running.add(fn);
    fn(() => this.#clear(fn));
    return true;
  }
  #clear(fn) {
    if (!this.#running.has(fn)) {
      return false;
    }
    const res = this.#reservations.get(fn);
    if (!res) {
      throw new Error("invalid reservation");
    }
    const { paths, dirs } = res;
    const next = /* @__PURE__ */ new Set();
    for (const path2 of paths) {
      const q = this.#queues.get(path2);
      if (!q || q?.[0] !== fn) {
        continue;
      }
      const q0 = q[1];
      if (!q0) {
        this.#queues.delete(path2);
        continue;
      }
      q.shift();
      if (typeof q0 === "function") {
        next.add(q0);
      } else {
        for (const f of q0) {
          next.add(f);
        }
      }
    }
    for (const dir of dirs) {
      const q = this.#queues.get(dir);
      const q0 = q?.[0];
      if (!q || !(q0 instanceof Set))
        continue;
      if (q0.size === 1 && q.length === 1) {
        this.#queues.delete(dir);
        continue;
      } else if (q0.size === 1) {
        q.shift();
        const n = q[0];
        if (typeof n === "function") {
          next.add(n);
        }
      } else {
        q0.delete(fn);
      }
    }
    this.#running.delete(fn);
    next.forEach((fn2) => this.#run(fn2));
    return true;
  }
}
const ONENTRY = Symbol("onEntry");
const CHECKFS = Symbol("checkFs");
const CHECKFS2 = Symbol("checkFs2");
const ISREUSABLE = Symbol("isReusable");
const MAKEFS = Symbol("makeFs");
const FILE = Symbol("file");
const DIRECTORY = Symbol("directory");
const LINK = Symbol("link");
const SYMLINK = Symbol("symlink");
const HARDLINK = Symbol("hardlink");
const UNSUPPORTED = Symbol("unsupported");
const CHECKPATH = Symbol("checkPath");
const MKDIR = Symbol("mkdir");
const ONERROR = Symbol("onError");
const PENDING = Symbol("pending");
const PEND = Symbol("pend");
const UNPEND = Symbol("unpend");
const ENDED = Symbol("ended");
const MAYBECLOSE = Symbol("maybeClose");
const SKIP = Symbol("skip");
const DOCHOWN = Symbol("doChown");
const UID = Symbol("uid");
const GID = Symbol("gid");
const CHECKED_CWD = Symbol("checkedCwd");
const platform = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
const isWindows = platform === "win32";
const DEFAULT_MAX_DEPTH = 1024;
const unlinkFile = (path2, cb) => {
  if (!isWindows) {
    return fs$1.unlink(path2, cb);
  }
  const name2 = path2 + ".DELETE." + randomBytes(16).toString("hex");
  fs$1.rename(path2, name2, (er) => {
    if (er) {
      return cb(er);
    }
    fs$1.unlink(name2, cb);
  });
};
const unlinkFileSync = (path2) => {
  if (!isWindows) {
    return fs$1.unlinkSync(path2);
  }
  const name2 = path2 + ".DELETE." + randomBytes(16).toString("hex");
  fs$1.renameSync(path2, name2);
  fs$1.unlinkSync(name2);
};
const uint32 = (a, b, c) => a !== void 0 && a === a >>> 0 ? a : b !== void 0 && b === b >>> 0 ? b : c;
class Unpack extends Parser {
  [ENDED] = false;
  [CHECKED_CWD] = false;
  [PENDING] = 0;
  reservations = new PathReservations();
  transform;
  writable = true;
  readable = false;
  uid;
  gid;
  setOwner;
  preserveOwner;
  processGid;
  processUid;
  maxDepth;
  forceChown;
  win32;
  newer;
  keep;
  noMtime;
  preservePaths;
  unlink;
  cwd;
  strip;
  processUmask;
  umask;
  dmode;
  fmode;
  chmod;
  constructor(opt = {}) {
    opt.ondone = () => {
      this[ENDED] = true;
      this[MAYBECLOSE]();
    };
    super(opt);
    this.transform = opt.transform;
    this.chmod = !!opt.chmod;
    if (typeof opt.uid === "number" || typeof opt.gid === "number") {
      if (typeof opt.uid !== "number" || typeof opt.gid !== "number") {
        throw new TypeError("cannot set owner without number uid and gid");
      }
      if (opt.preserveOwner) {
        throw new TypeError("cannot preserve owner in archive and also set owner explicitly");
      }
      this.uid = opt.uid;
      this.gid = opt.gid;
      this.setOwner = true;
    } else {
      this.uid = void 0;
      this.gid = void 0;
      this.setOwner = false;
    }
    if (opt.preserveOwner === void 0 && typeof opt.uid !== "number") {
      this.preserveOwner = !!(process.getuid && process.getuid() === 0);
    } else {
      this.preserveOwner = !!opt.preserveOwner;
    }
    this.processUid = (this.preserveOwner || this.setOwner) && process.getuid ? process.getuid() : void 0;
    this.processGid = (this.preserveOwner || this.setOwner) && process.getgid ? process.getgid() : void 0;
    this.maxDepth = typeof opt.maxDepth === "number" ? opt.maxDepth : DEFAULT_MAX_DEPTH;
    this.forceChown = opt.forceChown === true;
    this.win32 = !!opt.win32 || isWindows;
    this.newer = !!opt.newer;
    this.keep = !!opt.keep;
    this.noMtime = !!opt.noMtime;
    this.preservePaths = !!opt.preservePaths;
    this.unlink = !!opt.unlink;
    this.cwd = normalizeWindowsPath(path$1.resolve(opt.cwd || process.cwd()));
    this.strip = Number(opt.strip) || 0;
    this.processUmask = !this.chmod ? 0 : typeof opt.processUmask === "number" ? opt.processUmask : process.umask();
    this.umask = typeof opt.umask === "number" ? opt.umask : this.processUmask;
    this.dmode = opt.dmode || 511 & ~this.umask;
    this.fmode = opt.fmode || 438 & ~this.umask;
    this.on("entry", (entry) => this[ONENTRY](entry));
  }
  // a bad or damaged archive is a warning for Parser, but an error
  // when extracting.  Mark those errors as unrecoverable, because
  // the Unpack contract cannot be met.
  warn(code2, msg, data = {}) {
    if (code2 === "TAR_BAD_ARCHIVE" || code2 === "TAR_ABORT") {
      data.recoverable = false;
    }
    return super.warn(code2, msg, data);
  }
  [MAYBECLOSE]() {
    if (this[ENDED] && this[PENDING] === 0) {
      this.emit("prefinish");
      this.emit("finish");
      this.emit("end");
    }
  }
  [CHECKPATH](entry) {
    const p = normalizeWindowsPath(entry.path);
    const parts = p.split("/");
    if (this.strip) {
      if (parts.length < this.strip) {
        return false;
      }
      if (entry.type === "Link") {
        const linkparts = normalizeWindowsPath(String(entry.linkpath)).split("/");
        if (linkparts.length >= this.strip) {
          entry.linkpath = linkparts.slice(this.strip).join("/");
        } else {
          return false;
        }
      }
      parts.splice(0, this.strip);
      entry.path = parts.join("/");
    }
    if (isFinite(this.maxDepth) && parts.length > this.maxDepth) {
      this.warn("TAR_ENTRY_ERROR", "path excessively deep", {
        entry,
        path: p,
        depth: parts.length,
        maxDepth: this.maxDepth
      });
      return false;
    }
    if (!this.preservePaths) {
      if (parts.includes("..") || /* c8 ignore next */
      isWindows && /^[a-z]:\.\.$/i.test(parts[0] ?? "")) {
        this.warn("TAR_ENTRY_ERROR", `path contains '..'`, {
          entry,
          path: p
        });
        return false;
      }
      const [root, stripped] = stripAbsolutePath(p);
      if (root) {
        entry.path = String(stripped);
        this.warn("TAR_ENTRY_INFO", `stripping ${root} from absolute path`, {
          entry,
          path: p
        });
      }
    }
    if (path$1.isAbsolute(entry.path)) {
      entry.absolute = normalizeWindowsPath(path$1.resolve(entry.path));
    } else {
      entry.absolute = normalizeWindowsPath(path$1.resolve(this.cwd, entry.path));
    }
    if (!this.preservePaths && typeof entry.absolute === "string" && entry.absolute.indexOf(this.cwd + "/") !== 0 && entry.absolute !== this.cwd) {
      this.warn("TAR_ENTRY_ERROR", "path escaped extraction target", {
        entry,
        path: normalizeWindowsPath(entry.path),
        resolvedPath: entry.absolute,
        cwd: this.cwd
      });
      return false;
    }
    if (entry.absolute === this.cwd && entry.type !== "Directory" && entry.type !== "GNUDumpDir") {
      return false;
    }
    if (this.win32) {
      const { root: aRoot } = path$1.win32.parse(String(entry.absolute));
      entry.absolute = aRoot + encode(String(entry.absolute).slice(aRoot.length));
      const { root: pRoot } = path$1.win32.parse(entry.path);
      entry.path = pRoot + encode(entry.path.slice(pRoot.length));
    }
    return true;
  }
  [ONENTRY](entry) {
    if (!this[CHECKPATH](entry)) {
      return entry.resume();
    }
    assert$1.equal(typeof entry.absolute, "string");
    switch (entry.type) {
      case "Directory":
      case "GNUDumpDir":
        if (entry.mode) {
          entry.mode = entry.mode | 448;
        }
      // eslint-disable-next-line no-fallthrough
      case "File":
      case "OldFile":
      case "ContiguousFile":
      case "Link":
      case "SymbolicLink":
        return this[CHECKFS](entry);
      case "CharacterDevice":
      case "BlockDevice":
      case "FIFO":
      default:
        return this[UNSUPPORTED](entry);
    }
  }
  [ONERROR](er, entry) {
    if (er.name === "CwdError") {
      this.emit("error", er);
    } else {
      this.warn("TAR_ENTRY_ERROR", er, { entry });
      this[UNPEND]();
      entry.resume();
    }
  }
  [MKDIR](dir, mode, cb) {
    mkdir(normalizeWindowsPath(dir), {
      uid: this.uid,
      gid: this.gid,
      processUid: this.processUid,
      processGid: this.processGid,
      umask: this.processUmask,
      preserve: this.preservePaths,
      unlink: this.unlink,
      cwd: this.cwd,
      mode
    }, cb);
  }
  [DOCHOWN](entry) {
    return this.forceChown || this.preserveOwner && (typeof entry.uid === "number" && entry.uid !== this.processUid || typeof entry.gid === "number" && entry.gid !== this.processGid) || typeof this.uid === "number" && this.uid !== this.processUid || typeof this.gid === "number" && this.gid !== this.processGid;
  }
  [UID](entry) {
    return uint32(this.uid, entry.uid, this.processUid);
  }
  [GID](entry) {
    return uint32(this.gid, entry.gid, this.processGid);
  }
  [FILE](entry, fullyDone) {
    const mode = typeof entry.mode === "number" ? entry.mode & 4095 : this.fmode;
    const stream = new WriteStream(String(entry.absolute), {
      // slight lie, but it can be numeric flags
      flags: getWriteFlag(entry.size),
      mode,
      autoClose: false
    });
    stream.on("error", (er) => {
      if (stream.fd) {
        fs$1.close(stream.fd, () => {
        });
      }
      stream.write = () => true;
      this[ONERROR](er, entry);
      fullyDone();
    });
    let actions = 1;
    const done = (er) => {
      if (er) {
        if (stream.fd) {
          fs$1.close(stream.fd, () => {
          });
        }
        this[ONERROR](er, entry);
        fullyDone();
        return;
      }
      if (--actions === 0) {
        if (stream.fd !== void 0) {
          fs$1.close(stream.fd, (er2) => {
            if (er2) {
              this[ONERROR](er2, entry);
            } else {
              this[UNPEND]();
            }
            fullyDone();
          });
        }
      }
    };
    stream.on("finish", () => {
      const abs = String(entry.absolute);
      const fd = stream.fd;
      if (typeof fd === "number" && entry.mtime && !this.noMtime) {
        actions++;
        const atime = entry.atime || /* @__PURE__ */ new Date();
        const mtime = entry.mtime;
        fs$1.futimes(fd, atime, mtime, (er) => er ? fs$1.utimes(abs, atime, mtime, (er2) => done(er2 && er)) : done());
      }
      if (typeof fd === "number" && this[DOCHOWN](entry)) {
        actions++;
        const uid = this[UID](entry);
        const gid = this[GID](entry);
        if (typeof uid === "number" && typeof gid === "number") {
          fs$1.fchown(fd, uid, gid, (er) => er ? fs$1.chown(abs, uid, gid, (er2) => done(er2 && er)) : done());
        }
      }
      done();
    });
    const tx = this.transform ? this.transform(entry) || entry : entry;
    if (tx !== entry) {
      tx.on("error", (er) => {
        this[ONERROR](er, entry);
        fullyDone();
      });
      entry.pipe(tx);
    }
    tx.pipe(stream);
  }
  [DIRECTORY](entry, fullyDone) {
    const mode = typeof entry.mode === "number" ? entry.mode & 4095 : this.dmode;
    this[MKDIR](String(entry.absolute), mode, (er) => {
      if (er) {
        this[ONERROR](er, entry);
        fullyDone();
        return;
      }
      let actions = 1;
      const done = () => {
        if (--actions === 0) {
          fullyDone();
          this[UNPEND]();
          entry.resume();
        }
      };
      if (entry.mtime && !this.noMtime) {
        actions++;
        fs$1.utimes(String(entry.absolute), entry.atime || /* @__PURE__ */ new Date(), entry.mtime, done);
      }
      if (this[DOCHOWN](entry)) {
        actions++;
        fs$1.chown(String(entry.absolute), Number(this[UID](entry)), Number(this[GID](entry)), done);
      }
      done();
    });
  }
  [UNSUPPORTED](entry) {
    entry.unsupported = true;
    this.warn("TAR_ENTRY_UNSUPPORTED", `unsupported entry type: ${entry.type}`, { entry });
    entry.resume();
  }
  [SYMLINK](entry, done) {
    this[LINK](entry, String(entry.linkpath), "symlink", done);
  }
  [HARDLINK](entry, done) {
    const linkpath = normalizeWindowsPath(path$1.resolve(this.cwd, String(entry.linkpath)));
    this[LINK](entry, linkpath, "link", done);
  }
  [PEND]() {
    this[PENDING]++;
  }
  [UNPEND]() {
    this[PENDING]--;
    this[MAYBECLOSE]();
  }
  [SKIP](entry) {
    this[UNPEND]();
    entry.resume();
  }
  // Check if we can reuse an existing filesystem entry safely and
  // overwrite it, rather than unlinking and recreating
  // Windows doesn't report a useful nlink, so we just never reuse entries
  [ISREUSABLE](entry, st) {
    return entry.type === "File" && !this.unlink && st.isFile() && st.nlink <= 1 && !isWindows;
  }
  // check if a thing is there, and if so, try to clobber it
  [CHECKFS](entry) {
    this[PEND]();
    const paths = [entry.path];
    if (entry.linkpath) {
      paths.push(entry.linkpath);
    }
    this.reservations.reserve(paths, (done) => this[CHECKFS2](entry, done));
  }
  [CHECKFS2](entry, fullyDone) {
    const done = (er) => {
      fullyDone(er);
    };
    const checkCwd2 = () => {
      this[MKDIR](this.cwd, this.dmode, (er) => {
        if (er) {
          this[ONERROR](er, entry);
          done();
          return;
        }
        this[CHECKED_CWD] = true;
        start();
      });
    };
    const start = () => {
      if (entry.absolute !== this.cwd) {
        const parent = normalizeWindowsPath(path$1.dirname(String(entry.absolute)));
        if (parent !== this.cwd) {
          return this[MKDIR](parent, this.dmode, (er) => {
            if (er) {
              this[ONERROR](er, entry);
              done();
              return;
            }
            afterMakeParent();
          });
        }
      }
      afterMakeParent();
    };
    const afterMakeParent = () => {
      fs$1.lstat(String(entry.absolute), (lstatEr, st) => {
        if (st && (this.keep || /* c8 ignore next */
        this.newer && st.mtime > (entry.mtime ?? st.mtime))) {
          this[SKIP](entry);
          done();
          return;
        }
        if (lstatEr || this[ISREUSABLE](entry, st)) {
          return this[MAKEFS](null, entry, done);
        }
        if (st.isDirectory()) {
          if (entry.type === "Directory") {
            const needChmod = this.chmod && entry.mode && (st.mode & 4095) !== entry.mode;
            const afterChmod = (er) => this[MAKEFS](er ?? null, entry, done);
            if (!needChmod) {
              return afterChmod();
            }
            return fs$1.chmod(String(entry.absolute), Number(entry.mode), afterChmod);
          }
          if (entry.absolute !== this.cwd) {
            return fs$1.rmdir(String(entry.absolute), (er) => this[MAKEFS](er ?? null, entry, done));
          }
        }
        if (entry.absolute === this.cwd) {
          return this[MAKEFS](null, entry, done);
        }
        unlinkFile(String(entry.absolute), (er) => this[MAKEFS](er ?? null, entry, done));
      });
    };
    if (this[CHECKED_CWD]) {
      start();
    } else {
      checkCwd2();
    }
  }
  [MAKEFS](er, entry, done) {
    if (er) {
      this[ONERROR](er, entry);
      done();
      return;
    }
    switch (entry.type) {
      case "File":
      case "OldFile":
      case "ContiguousFile":
        return this[FILE](entry, done);
      case "Link":
        return this[HARDLINK](entry, done);
      case "SymbolicLink":
        return this[SYMLINK](entry, done);
      case "Directory":
      case "GNUDumpDir":
        return this[DIRECTORY](entry, done);
    }
  }
  [LINK](entry, linkpath, link, done) {
    fs$1[link](linkpath, String(entry.absolute), (er) => {
      if (er) {
        this[ONERROR](er, entry);
      } else {
        this[UNPEND]();
        entry.resume();
      }
      done();
    });
  }
}
const callSync = (fn) => {
  try {
    return [null, fn()];
  } catch (er) {
    return [er, null];
  }
};
class UnpackSync extends Unpack {
  sync = true;
  [MAKEFS](er, entry) {
    return super[MAKEFS](er, entry, () => {
    });
  }
  [CHECKFS](entry) {
    if (!this[CHECKED_CWD]) {
      const er2 = this[MKDIR](this.cwd, this.dmode);
      if (er2) {
        return this[ONERROR](er2, entry);
      }
      this[CHECKED_CWD] = true;
    }
    if (entry.absolute !== this.cwd) {
      const parent = normalizeWindowsPath(path$1.dirname(String(entry.absolute)));
      if (parent !== this.cwd) {
        const mkParent = this[MKDIR](parent, this.dmode);
        if (mkParent) {
          return this[ONERROR](mkParent, entry);
        }
      }
    }
    const [lstatEr, st] = callSync(() => fs$1.lstatSync(String(entry.absolute)));
    if (st && (this.keep || /* c8 ignore next */
    this.newer && st.mtime > (entry.mtime ?? st.mtime))) {
      return this[SKIP](entry);
    }
    if (lstatEr || this[ISREUSABLE](entry, st)) {
      return this[MAKEFS](null, entry);
    }
    if (st.isDirectory()) {
      if (entry.type === "Directory") {
        const needChmod = this.chmod && entry.mode && (st.mode & 4095) !== entry.mode;
        const [er3] = needChmod ? callSync(() => {
          fs$1.chmodSync(String(entry.absolute), Number(entry.mode));
        }) : [];
        return this[MAKEFS](er3, entry);
      }
      const [er2] = callSync(() => fs$1.rmdirSync(String(entry.absolute)));
      this[MAKEFS](er2, entry);
    }
    const [er] = entry.absolute === this.cwd ? [] : callSync(() => unlinkFileSync(String(entry.absolute)));
    this[MAKEFS](er, entry);
  }
  [FILE](entry, done) {
    const mode = typeof entry.mode === "number" ? entry.mode & 4095 : this.fmode;
    const oner = (er) => {
      let closeError;
      try {
        fs$1.closeSync(fd);
      } catch (e) {
        closeError = e;
      }
      if (er || closeError) {
        this[ONERROR](er || closeError, entry);
      }
      done();
    };
    let fd;
    try {
      fd = fs$1.openSync(String(entry.absolute), getWriteFlag(entry.size), mode);
    } catch (er) {
      return oner(er);
    }
    const tx = this.transform ? this.transform(entry) || entry : entry;
    if (tx !== entry) {
      tx.on("error", (er) => this[ONERROR](er, entry));
      entry.pipe(tx);
    }
    tx.on("data", (chunk) => {
      try {
        fs$1.writeSync(fd, chunk, 0, chunk.length);
      } catch (er) {
        oner(er);
      }
    });
    tx.on("end", () => {
      let er = null;
      if (entry.mtime && !this.noMtime) {
        const atime = entry.atime || /* @__PURE__ */ new Date();
        const mtime = entry.mtime;
        try {
          fs$1.futimesSync(fd, atime, mtime);
        } catch (futimeser) {
          try {
            fs$1.utimesSync(String(entry.absolute), atime, mtime);
          } catch (utimeser) {
            er = futimeser;
          }
        }
      }
      if (this[DOCHOWN](entry)) {
        const uid = this[UID](entry);
        const gid = this[GID](entry);
        try {
          fs$1.fchownSync(fd, Number(uid), Number(gid));
        } catch (fchowner) {
          try {
            fs$1.chownSync(String(entry.absolute), Number(uid), Number(gid));
          } catch (chowner) {
            er = er || fchowner;
          }
        }
      }
      oner(er);
    });
  }
  [DIRECTORY](entry, done) {
    const mode = typeof entry.mode === "number" ? entry.mode & 4095 : this.dmode;
    const er = this[MKDIR](String(entry.absolute), mode);
    if (er) {
      this[ONERROR](er, entry);
      done();
      return;
    }
    if (entry.mtime && !this.noMtime) {
      try {
        fs$1.utimesSync(String(entry.absolute), entry.atime || /* @__PURE__ */ new Date(), entry.mtime);
      } catch (er2) {
      }
    }
    if (this[DOCHOWN](entry)) {
      try {
        fs$1.chownSync(String(entry.absolute), Number(this[UID](entry)), Number(this[GID](entry)));
      } catch (er2) {
      }
    }
    done();
    entry.resume();
  }
  [MKDIR](dir, mode) {
    try {
      return mkdirSync(normalizeWindowsPath(dir), {
        uid: this.uid,
        gid: this.gid,
        processUid: this.processUid,
        processGid: this.processGid,
        umask: this.processUmask,
        preserve: this.preservePaths,
        unlink: this.unlink,
        cwd: this.cwd,
        mode
      });
    } catch (er) {
      return er;
    }
  }
  [LINK](entry, linkpath, link, done) {
    const ls = `${link}Sync`;
    try {
      fs$1[ls](linkpath, String(entry.absolute));
      done();
      entry.resume();
    } catch (er) {
      return this[ONERROR](er, entry);
    }
  }
}
const extractFileSync = (opt) => {
  const u = new UnpackSync(opt);
  const file = opt.file;
  const stat = fs$1.statSync(file);
  const readSize = opt.maxReadSize || 16 * 1024 * 1024;
  const stream = new ReadStreamSync(file, {
    readSize,
    size: stat.size
  });
  stream.pipe(u);
};
const extractFile = (opt, _) => {
  const u = new Unpack(opt);
  const readSize = opt.maxReadSize || 16 * 1024 * 1024;
  const file = opt.file;
  const p = new Promise((resolve, reject) => {
    u.on("error", reject);
    u.on("close", resolve);
    fs$1.stat(file, (er, stat) => {
      if (er) {
        reject(er);
      } else {
        const stream = new ReadStream(file, {
          readSize,
          size: stat.size
        });
        stream.on("error", reject);
        stream.pipe(u);
      }
    });
  });
  return p;
};
const extract = makeCommand(extractFileSync, extractFile, (opt) => new UnpackSync(opt), (opt) => new Unpack(opt), (opt, files) => {
  if (files?.length)
    filesFilter(opt, files);
});
const replaceSync = (opt, files) => {
  const p = new PackSync(opt);
  let threw = true;
  let fd;
  let position;
  try {
    try {
      fd = fs$1.openSync(opt.file, "r+");
    } catch (er) {
      if (er?.code === "ENOENT") {
        fd = fs$1.openSync(opt.file, "w+");
      } else {
        throw er;
      }
    }
    const st = fs$1.fstatSync(fd);
    const headBuf = Buffer.alloc(512);
    POSITION: for (position = 0; position < st.size; position += 512) {
      for (let bufPos = 0, bytes = 0; bufPos < 512; bufPos += bytes) {
        bytes = fs$1.readSync(fd, headBuf, bufPos, headBuf.length - bufPos, position + bufPos);
        if (position === 0 && headBuf[0] === 31 && headBuf[1] === 139) {
          throw new Error("cannot append to compressed archives");
        }
        if (!bytes) {
          break POSITION;
        }
      }
      const h = new Header(headBuf);
      if (!h.cksumValid) {
        break;
      }
      const entryBlockSize = 512 * Math.ceil((h.size || 0) / 512);
      if (position + entryBlockSize + 512 > st.size) {
        break;
      }
      position += entryBlockSize;
      if (opt.mtimeCache && h.mtime) {
        opt.mtimeCache.set(String(h.path), h.mtime);
      }
    }
    threw = false;
    streamSync(opt, p, position, fd, files);
  } finally {
    if (threw) {
      try {
        fs$1.closeSync(fd);
      } catch (er) {
      }
    }
  }
};
const streamSync = (opt, p, position, fd, files) => {
  const stream = new WriteStreamSync(opt.file, {
    fd,
    start: position
  });
  p.pipe(stream);
  addFilesSync(p, files);
};
const replaceAsync = (opt, files) => {
  files = Array.from(files);
  const p = new Pack(opt);
  const getPos = (fd, size, cb_) => {
    const cb = (er, pos2) => {
      if (er) {
        fs$1.close(fd, (_) => cb_(er));
      } else {
        cb_(null, pos2);
      }
    };
    let position = 0;
    if (size === 0) {
      return cb(null, 0);
    }
    let bufPos = 0;
    const headBuf = Buffer.alloc(512);
    const onread = (er, bytes) => {
      if (er || typeof bytes === "undefined") {
        return cb(er);
      }
      bufPos += bytes;
      if (bufPos < 512 && bytes) {
        return fs$1.read(fd, headBuf, bufPos, headBuf.length - bufPos, position + bufPos, onread);
      }
      if (position === 0 && headBuf[0] === 31 && headBuf[1] === 139) {
        return cb(new Error("cannot append to compressed archives"));
      }
      if (bufPos < 512) {
        return cb(null, position);
      }
      const h = new Header(headBuf);
      if (!h.cksumValid) {
        return cb(null, position);
      }
      const entryBlockSize = 512 * Math.ceil((h.size ?? 0) / 512);
      if (position + entryBlockSize + 512 > size) {
        return cb(null, position);
      }
      position += entryBlockSize + 512;
      if (position >= size) {
        return cb(null, position);
      }
      if (opt.mtimeCache && h.mtime) {
        opt.mtimeCache.set(String(h.path), h.mtime);
      }
      bufPos = 0;
      fs$1.read(fd, headBuf, 0, 512, position, onread);
    };
    fs$1.read(fd, headBuf, 0, 512, position, onread);
  };
  const promise = new Promise((resolve, reject) => {
    p.on("error", reject);
    let flag = "r+";
    const onopen = (er, fd) => {
      if (er && er.code === "ENOENT" && flag === "r+") {
        flag = "w+";
        return fs$1.open(opt.file, flag, onopen);
      }
      if (er || !fd) {
        return reject(er);
      }
      fs$1.fstat(fd, (er2, st) => {
        if (er2) {
          return fs$1.close(fd, () => reject(er2));
        }
        getPos(fd, st.size, (er3, position) => {
          if (er3) {
            return reject(er3);
          }
          const stream = new WriteStream(opt.file, {
            fd,
            start: position
          });
          p.pipe(stream);
          stream.on("error", reject);
          stream.on("close", resolve);
          addFilesAsync(p, files);
        });
      });
    };
    fs$1.open(opt.file, flag, onopen);
  });
  return promise;
};
const addFilesSync = (p, files) => {
  files.forEach((file) => {
    if (file.charAt(0) === "@") {
      list({
        file: path$1.resolve(p.cwd, file.slice(1)),
        sync: true,
        noResume: true,
        onReadEntry: (entry) => p.add(entry)
      });
    } else {
      p.add(file);
    }
  });
  p.end();
};
const addFilesAsync = async (p, files) => {
  for (let i = 0; i < files.length; i++) {
    const file = String(files[i]);
    if (file.charAt(0) === "@") {
      await list({
        file: path$1.resolve(String(p.cwd), file.slice(1)),
        noResume: true,
        onReadEntry: (entry) => p.add(entry)
      });
    } else {
      p.add(file);
    }
  }
  p.end();
};
const replace = makeCommand(
  replaceSync,
  replaceAsync,
  /* c8 ignore start */
  () => {
    throw new TypeError("file is required");
  },
  () => {
    throw new TypeError("file is required");
  },
  /* c8 ignore stop */
  (opt, entries) => {
    if (!isFile(opt)) {
      throw new TypeError("file is required");
    }
    if (opt.gzip || opt.brotli || opt.zstd || opt.file.endsWith(".br") || opt.file.endsWith(".tbr")) {
      throw new TypeError("cannot append to compressed archives");
    }
    if (!entries?.length) {
      throw new TypeError("no paths specified to add/replace");
    }
  }
);
makeCommand(replace.syncFile, replace.asyncFile, replace.syncNoFile, replace.asyncNoFile, (opt, entries = []) => {
  replace.validate?.(opt, entries);
  mtimeFilter(opt);
});
const mtimeFilter = (opt) => {
  const filter = opt.filter;
  if (!opt.mtimeCache) {
    opt.mtimeCache = /* @__PURE__ */ new Map();
  }
  opt.filter = filter ? (path2, stat) => filter(path2, stat) && !/* c8 ignore start */
  ((opt.mtimeCache?.get(path2) ?? stat.mtime ?? 0) > (stat.mtime ?? 0)) : (path2, stat) => !/* c8 ignore start */
  ((opt.mtimeCache?.get(path2) ?? stat.mtime ?? 0) > (stat.mtime ?? 0));
};
var pidusage$1 = { exports: {} };
var bin;
var hasRequiredBin;
function requireBin() {
  if (hasRequiredBin) return bin;
  hasRequiredBin = 1;
  const spawn2 = require$$2.spawn;
  function run(cmd, args, options, done) {
    if (typeof options === "function") {
      done = options;
      options = void 0;
    }
    let executed = false;
    const ch = spawn2(cmd, args, options);
    let stdout = "";
    let stderr = "";
    ch.stdout.on("data", function(d) {
      stdout += d.toString();
    });
    ch.stderr.on("data", function(d) {
      stderr += d.toString();
    });
    ch.on("error", function(err) {
      if (executed) return;
      executed = true;
      done(new Error(err));
    });
    ch.on("close", function(code2, signal) {
      if (executed) return;
      executed = true;
      if (stderr) {
        return done(new Error(stderr));
      }
      done(null, stdout, code2);
    });
  }
  bin = run;
  return bin;
}
var history_1;
var hasRequiredHistory;
function requireHistory() {
  if (hasRequiredHistory) return history_1;
  hasRequiredHistory = 1;
  const DEFAULT_MAXAGE = 6e4;
  const expiration = {};
  const history = {};
  const expireListeners = {};
  let size = 0;
  let interval = null;
  function get(pid, maxage) {
    if (maxage <= 0) {
      return;
    }
    if (history[pid] !== void 0) {
      expiration[pid] = Date.now() + (maxage || DEFAULT_MAXAGE);
    }
    return history[pid];
  }
  function set(pid, object, maxage, onExpire) {
    if (object === void 0 || maxage <= 0) return;
    expiration[pid] = Date.now() + (maxage || DEFAULT_MAXAGE);
    if (history[pid] === void 0) {
      size++;
      sheduleInvalidator(maxage);
    }
    history[pid] = object;
    if (onExpire) {
      expireListeners[pid] = onExpire;
    }
  }
  function sheduleInvalidator(maxage) {
    if (size > 0) {
      if (interval === null) {
        interval = setInterval(runInvalidator, (maxage || DEFAULT_MAXAGE) / 2);
        if (typeof interval.unref === "function") {
          interval.unref();
        }
      }
      return;
    }
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }
  function runInvalidator() {
    const now = Date.now();
    const pids = Object.keys(expiration);
    for (let i = 0; i < pids.length; i++) {
      const pid = pids[i];
      if (expiration[pid] < now) {
        size--;
        if (expireListeners[pid]) {
          expireListeners[pid](history[pid]);
        }
        delete history[pid];
        delete expiration[pid];
        delete expireListeners[pid];
      }
    }
    sheduleInvalidator();
  }
  function deleteLoop(obj) {
    for (const i in obj) {
      delete obj[i];
    }
  }
  function clear() {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    deleteLoop(history);
    deleteLoop(expiration);
    deleteLoop(expireListeners);
  }
  history_1 = {
    get,
    set,
    clear
  };
  return history_1;
}
var ps_1;
var hasRequiredPs;
function requirePs() {
  if (hasRequiredPs) return ps_1;
  hasRequiredPs = 1;
  const os = require$$0$1;
  const bin2 = requireBin();
  const history = requireHistory();
  const PLATFORM = os.platform();
  function parseTime(timestr, centisec) {
    let time = 0;
    const tpart = timestr.split(/-|:|\./);
    let i = tpart.length - 1;
    if (i >= 0 && centisec && PLATFORM === "darwin") {
      time += parseInt(tpart[i--], 10) * 10;
    }
    if (i >= 0) {
      time += parseInt(tpart[i--], 10) * 1e3;
    }
    if (i >= 0) {
      time += parseInt(tpart[i--], 10) * 6e4;
    }
    if (i >= 0) {
      time += parseInt(tpart[i--], 10) * 36e5;
    }
    if (i >= 0) {
      time += parseInt(tpart[i--], 10) * 864e5;
    }
    return time;
  }
  function ps(pids, options, done) {
    const pArg = pids.join(",");
    let args = ["-o", "etime,pid,ppid,pcpu,rss,time", "-p", pArg];
    if (PLATFORM === "aix" || PLATFORM === "os400") {
      args = ["-o", "etime,pid,ppid,pcpu,rssize,time", "-p", pArg];
    }
    bin2("ps", args, function(err, stdout, code2) {
      if (err) {
        if (PLATFORM === "os390" && /no matching processes found/.test(err)) {
          err = new Error("No matching pid found");
          err.code = "ENOENT";
        }
        return done(err);
      }
      if (code2 === 1) {
        const error = new Error("No matching pid found");
        error.code = "ENOENT";
        return done(error);
      }
      if (code2 !== 0) {
        return done(new Error("pidusage ps command exited with code " + code2));
      }
      const date = Date.now();
      stdout = stdout.split(os.EOL);
      const statistics = {};
      for (let i = 1; i < stdout.length; i++) {
        const line = stdout[i].trim().split(/\s+/);
        if (!line || line.length !== 6) {
          continue;
        }
        const pid = parseInt(line[1], 10);
        let hst = history.get(pid, options.maxage);
        if (hst === void 0) hst = {};
        const ppid = parseInt(line[2], 10);
        const memory = parseInt(line[4], 10) * 1024;
        const etime = parseTime(line[0]);
        const ctime = parseTime(line[5], true);
        const total = ctime - (hst.ctime || 0);
        const seconds = Math.abs(hst.elapsed !== void 0 ? etime - hst.elapsed : etime);
        const cpu2 = seconds > 0 ? total / seconds * 100 : 0;
        statistics[pid] = {
          cpu: cpu2,
          memory,
          ppid,
          pid,
          ctime,
          elapsed: etime,
          timestamp: date
        };
        history.set(pid, statistics[pid], options.maxage);
      }
      done(null, statistics);
    });
  }
  ps_1 = ps;
  return ps_1;
}
var parallel_1;
var hasRequiredParallel;
function requireParallel() {
  if (hasRequiredParallel) return parallel_1;
  hasRequiredParallel = 1;
  function parallel(fns, options, done) {
    if (typeof options === "function") {
      done = options;
      options = {};
    }
    let keys;
    if (!Array.isArray(fns)) {
      keys = Object.keys(fns);
    }
    const length = keys ? keys.length : fns.length;
    let pending = length;
    const results = keys ? {} : [];
    function each(i, err, result) {
      results[i] = result;
      if (--pending === 0 || err && !options.graceful) {
        if (options.graceful && err && length > 1) {
          err = null;
        }
        done && done(err, results);
        done = null;
      }
    }
    if (keys) {
      keys.forEach(function(key) {
        fns[key](function(err, res) {
          each(key, err, res);
        });
      });
    } else {
      fns.forEach(function(fn, i) {
        fn(function(err, res) {
          each(i, err, res);
        });
      });
    }
  }
  parallel_1 = parallel;
  return parallel_1;
}
var cpu;
var hasRequiredCpu;
function requireCpu() {
  if (hasRequiredCpu) return cpu;
  hasRequiredCpu = 1;
  const os = require$$0$1;
  const fs$12 = fs;
  const exec = require$$2.exec;
  const parallel = requireParallel();
  function updateCpu(cpu2, next) {
    if (cpu2 !== null) {
      getRealUptime(function(err, uptime) {
        if (err) return next(err);
        cpu2.uptime = uptime;
        next(null, cpu2);
      });
      return;
    }
    parallel([
      getClockAndPageSize,
      getRealUptime
    ], function(err, data) {
      if (err) return next(err);
      cpu2 = {
        clockTick: data[0].clockTick,
        pageSize: data[0].pageSize,
        uptime: data[1]
      };
      next(null, cpu2);
    });
  }
  cpu = updateCpu;
  function getRealUptime(next) {
    fs$12.readFile("/proc/uptime", "utf8", function(err, uptime) {
      if (err || uptime === void 0) {
        if (!process.env.PIDUSAGE_SILENT) {
          console.warn("[pidusage] We couldn't find uptime from /proc/uptime, using os.uptime() value");
        }
        return next(null, os.uptime() || /* @__PURE__ */ new Date() / 1e3);
      }
      return next(null, parseFloat(uptime.split(" ")[0]));
    });
  }
  function getClockAndPageSize(next) {
    parallel([
      function getClockTick(cb) {
        getconf("CLK_TCK", { default: 100 }, cb);
      },
      function getPageSize(cb) {
        getconf("PAGESIZE", { default: 4096 }, cb);
      }
    ], function(err, data) {
      if (err) return next(err);
      next(null, { clockTick: data[0], pageSize: data[1] });
    });
  }
  function getconf(keyword, options, next) {
    if (typeof options === "function") {
      next = options;
      options = { default: "" };
    }
    exec("getconf " + keyword, function(error, stdout, stderr) {
      if (error !== null) {
        if (!process.env.PIDUSAGE_SILENT) {
          console.error('Error while calling "getconf ' + keyword + '"', error);
        }
        return next(null, options.default);
      }
      stdout = parseInt(stdout);
      if (!isNaN(stdout)) {
        return next(null, stdout);
      }
      return next(null, options.default);
    });
  }
  return cpu;
}
var safeBuffer = { exports: {} };
var hasRequiredSafeBuffer;
function requireSafeBuffer() {
  if (hasRequiredSafeBuffer) return safeBuffer.exports;
  hasRequiredSafeBuffer = 1;
  (function(module, exports$1) {
    var buffer = require$$0$2;
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports$1);
      exports$1.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  })(safeBuffer, safeBuffer.exports);
  return safeBuffer.exports;
}
var procfile_1;
var hasRequiredProcfile;
function requireProcfile() {
  if (hasRequiredProcfile) return procfile_1;
  hasRequiredProcfile = 1;
  const fs$12 = fs;
  const path$12 = path;
  const updateCpu = requireCpu();
  const parallel = requireParallel();
  const history = requireHistory();
  let cpuInfo = null;
  const Buffer2 = requireSafeBuffer().Buffer;
  const SIZE = 1024;
  function noop2() {
  }
  function open(path2, history2, cb) {
    if (history2.fd) {
      return cb(null, history2.fd);
    }
    fs$12.open(path2, "r", cb);
  }
  function close(history2) {
    if (history2.fd) {
      fs$12.close(history2.fd, noop2);
    }
  }
  function readUntilEnd(fd, buf, cb) {
    let firstRead = false;
    if (typeof buf === "function") {
      cb = buf;
      buf = Buffer2.alloc(SIZE);
      firstRead = true;
    }
    fs$12.read(fd, buf, 0, SIZE, 0, function(err, bytesRead, buffer) {
      if (err) {
        cb(err);
        return;
      }
      const data = Buffer2.concat([buf, buffer], firstRead ? bytesRead : buf.length + bytesRead);
      if (bytesRead === SIZE) {
        readUntilEnd(fd, data, cb);
        return;
      }
      cb(null, buf);
    });
  }
  function readProcFile(pid, options, done) {
    let hst = history.get(pid, options.maxage);
    let again = false;
    if (hst === void 0) {
      again = true;
      hst = {};
    }
    open(path$12.join("/proc", "" + pid, "stat"), hst, function(err, fd) {
      if (err) {
        if (err.code === "ENOENT") {
          err.message = "No matching pid found";
        }
        return done(err, null);
      }
      if (err) {
        return done(err);
      }
      readUntilEnd(fd, function(err2, buffer) {
        if (err2) {
          return done(err2);
        }
        let infos = buffer.toString("utf8");
        const date = Date.now();
        const index = infos.lastIndexOf(")");
        infos = infos.substr(index + 2).split(" ");
        const stat = {
          ppid: parseInt(infos[1]),
          utime: parseFloat(infos[11]) * 1e3 / cpuInfo.clockTick,
          stime: parseFloat(infos[12]) * 1e3 / cpuInfo.clockTick,
          cutime: parseFloat(infos[13]) * 1e3 / cpuInfo.clockTick,
          cstime: parseFloat(infos[14]) * 1e3 / cpuInfo.clockTick,
          start: parseFloat(infos[19]) * 1e3 / cpuInfo.clockTick,
          rss: parseFloat(infos[21]),
          uptime: cpuInfo.uptime * 1e3,
          fd
        };
        const memory = stat.rss * cpuInfo.pageSize;
        const childrens = options.childrens ? stat.cutime + stat.cstime : 0;
        const total = stat.stime - (hst.stime || 0) + stat.utime - (hst.utime || 0) + childrens;
        const seconds = Math.abs(hst.uptime !== void 0 ? stat.uptime - hst.uptime : stat.start - stat.uptime);
        const cpu2 = seconds > 0 ? total / seconds * 100 : 0;
        history.set(pid, stat, options.maxage, close);
        if (again) {
          return readProcFile(pid, options, done);
        }
        return done(null, {
          cpu: cpu2,
          memory,
          ctime: stat.utime + stat.stime,
          elapsed: stat.uptime - stat.start,
          timestamp: date,
          pid,
          ppid: stat.ppid
        });
      });
    });
  }
  function procfile(pids, options, done) {
    updateCpu(cpuInfo, function(err, result) {
      if (err) return done(err);
      cpuInfo = result;
      const fns = {};
      pids.forEach(function(pid, i) {
        fns[pid] = function(cb) {
          readProcFile(pid, options, cb);
        };
      });
      parallel(fns, { graceful: true }, done);
    });
  }
  procfile_1 = procfile;
  return procfile_1;
}
var wmic_1;
var hasRequiredWmic;
function requireWmic() {
  if (hasRequiredWmic) return wmic_1;
  hasRequiredWmic = 1;
  const os = require$$0$1;
  const bin2 = requireBin();
  const history = requireHistory();
  function parseDate(datestr) {
    const year = datestr.substring(0, 4);
    const month = datestr.substring(4, 6);
    const day = datestr.substring(6, 8);
    const hour = datestr.substring(8, 10);
    const minutes = datestr.substring(10, 12);
    const seconds = datestr.substring(12, 14);
    const useconds = datestr.substring(15, 21);
    const sign = datestr.substring(21, 22);
    const tmz = parseInt(datestr.substring(22, 25), 10);
    const tmzh = Math.floor(tmz / 60);
    const tmzm = tmz % 60;
    return /* @__PURE__ */ new Date(
      year + "-" + month + "-" + day + "T" + hour + ":" + minutes + ":" + seconds + "." + useconds + sign + (tmzh > 9 ? tmzh : "0" + tmzh) + (tmzm > 9 ? tmzm : "0" + tmzm)
    );
  }
  function wmic(pids, options, done) {
    let whereClause = "ProcessId=" + pids[0];
    for (let i = 1; i < pids.length; i++) {
      whereClause += " or ProcessId=" + pids[i];
    }
    const args = [
      "PROCESS",
      "where",
      '"' + whereClause + '"',
      "get",
      "CreationDate,KernelModeTime,ParentProcessId,ProcessId,UserModeTime,WorkingSetSize"
    ];
    bin2("wmic", args, { windowsHide: true, windowsVerbatimArguments: true }, function(err, stdout, code2) {
      if (err) {
        if (err.message.indexOf("No Instance(s) Available.") !== -1) {
          const error = new Error("No matching pid found");
          error.code = "ENOENT";
          return done(error);
        }
        return done(err);
      }
      if (code2 !== 0) {
        return done(new Error("pidusage wmic command exited with code " + code2));
      }
      const date = Date.now();
      const uptime = Math.floor(os.uptime() || date / 1e3);
      stdout = stdout.split(os.EOL);
      let again = false;
      const statistics = {};
      for (let i = 1; i < stdout.length; i++) {
        const line = stdout[i].trim().split(/\s+/);
        if (!line || line.length !== 6) {
          continue;
        }
        const creation = parseDate(line[0]);
        const ppid = parseInt(line[2], 10);
        const pid = parseInt(line[3], 10);
        const kerneltime = Math.round(parseInt(line[1], 10) / 1e4);
        const usertime = Math.round(parseInt(line[4], 10) / 1e4);
        const memory = parseInt(line[5], 10);
        let hst = history.get(pid, options.maxage);
        if (hst === void 0) {
          again = true;
          hst = { ctime: kerneltime + usertime, uptime };
        }
        const total = (kerneltime + usertime - hst.ctime) / 1e3;
        const seconds = uptime - hst.uptime;
        const cpu2 = seconds > 0 ? total / seconds * 100 : 0;
        history.set(pid, { ctime: usertime + kerneltime, uptime }, options.maxage);
        statistics[pid] = {
          cpu: cpu2,
          memory,
          ppid,
          pid,
          ctime: usertime + kerneltime,
          elapsed: date - creation.getTime(),
          timestamp: date
        };
      }
      if (again) {
        return wmic(pids, options, function(err2, stats2) {
          if (err2) return done(err2);
          done(null, Object.assign(statistics, stats2));
        });
      }
      done(null, statistics);
    });
  }
  wmic_1 = wmic;
  return wmic_1;
}
var gwmi_1;
var hasRequiredGwmi;
function requireGwmi() {
  if (hasRequiredGwmi) return gwmi_1;
  hasRequiredGwmi = 1;
  const os = require$$0$1;
  const bin2 = requireBin();
  const history = requireHistory();
  function parseDate(datestr) {
    const year = datestr.substring(0, 4);
    const month = datestr.substring(4, 6);
    const day = datestr.substring(6, 8);
    const hour = datestr.substring(8, 10);
    const minutes = datestr.substring(10, 12);
    const seconds = datestr.substring(12, 14);
    const useconds = datestr.substring(15, 21);
    const sign = datestr.substring(21, 22);
    const tmz = parseInt(datestr.substring(22, 25), 10);
    const tmzh = Math.floor(tmz / 60);
    const tmzm = tmz % 60;
    return /* @__PURE__ */ new Date(
      year + "-" + month + "-" + day + "T" + hour + ":" + minutes + ":" + seconds + "." + useconds + sign + (tmzh > 9 ? tmzh : "0" + tmzh) + (tmzm > 9 ? tmzm : "0" + tmzm)
    );
  }
  function gwmi(pids, options, done) {
    let whereClause = "ProcessId=" + pids[0];
    for (let i = 1; i < pids.length; i++) {
      whereClause += " or ProcessId=" + pids[i];
    }
    const property = "CreationDate,KernelModeTime,ParentProcessId,ProcessId,UserModeTime,WorkingSetSize";
    const args = ["win32_process", "-Filter", "'" + whereClause + "'", "| select " + property, "| format-table"];
    bin2("gwmi", args, { windowsHide: true, windowsVerbatimArguments: true, shell: "powershell.exe" }, function(err, stdout, code2) {
      if (err) {
        if (err.message.indexOf("No Instance(s) Available.") !== -1) {
          const error = new Error("No matching pid found");
          error.code = "ENOENT";
          return done(error);
        }
        return done(err);
      }
      if (code2 !== 0) {
        return done(new Error("pidusage gwmi command exited with code " + code2));
      }
      const date = Date.now();
      const uptime = Math.floor(os.uptime() || date / 1e3);
      stdout = stdout.split(os.EOL).slice(1);
      const index = stdout.findIndex((v) => !!v);
      stdout = stdout.slice(index + 2);
      if (!stdout.length) {
        const error = new Error("No matching pid found");
        error.code = "ENOENT";
        return done(error);
      }
      let again = false;
      const statistics = {};
      for (let i = 0; i < stdout.length; i++) {
        const line = stdout[i].trim().split(/\s+/);
        if (!line || line.length === 1) {
          continue;
        }
        const creation = parseDate(line[0]);
        const ppid = parseInt(line[2], 10);
        const pid = parseInt(line[3], 10);
        const kerneltime = Math.round(parseInt(line[1], 10) / 1e4);
        const usertime = Math.round(parseInt(line[4], 10) / 1e4);
        const memory = parseInt(line[5], 10);
        let hst = history.get(pid, options.maxage);
        if (hst === void 0) {
          again = true;
          hst = { ctime: kerneltime + usertime, uptime };
        }
        const total = (kerneltime + usertime - hst.ctime) / 1e3;
        const seconds = uptime - hst.uptime;
        const cpu2 = seconds > 0 ? total / seconds * 100 : 0;
        history.set(pid, { ctime: usertime + kerneltime, uptime }, options.maxage);
        statistics[pid] = {
          cpu: cpu2,
          memory,
          ppid,
          pid,
          ctime: usertime + kerneltime,
          elapsed: date - creation.getTime(),
          timestamp: date
        };
      }
      if (again) {
        return gwmi(pids, options, function(err2, stats2) {
          if (err2) return done(err2);
          done(null, Object.assign(statistics, stats2));
        });
      }
      done(null, statistics);
    });
  }
  gwmi_1 = gwmi;
  return gwmi_1;
}
var stats;
var hasRequiredStats;
function requireStats() {
  if (hasRequiredStats) return stats;
  hasRequiredStats = 1;
  const fs$12 = fs;
  const os = require$$0$1;
  const spawn2 = require$$2.spawn;
  const requireMap = {
    ps: () => requirePs(),
    procfile: () => requireProcfile(),
    wmic: () => requireWmic(),
    gwmi: () => requireGwmi()
  };
  const platformToMethod = {
    aix: "ps",
    os400: "ps",
    android: "procfile",
    alpine: "procfile",
    darwin: "ps",
    freebsd: "ps",
    os390: "ps",
    linux: "procfile",
    netbsd: "procfile",
    openbsd: "ps",
    sunos: "ps",
    win: "wmic"
  };
  let platform2 = os.platform();
  if (fs$12.existsSync("/etc/alpine-release")) {
    platform2 = "alpine";
  }
  if (platform2.match(/^win/)) {
    platform2 = "win";
  }
  let stat;
  try {
    stat = requireMap[platformToMethod[platform2]]();
  } catch (err) {
  }
  function get(pids, options, callback) {
    let fn = stat;
    if (platform2 !== "win" && options.usePs === true) {
      fn = requireMap.ps();
    }
    if (platform2 === "win") {
      let child;
      try {
        child = spawn2("wmic", function(err) {
          if (err) throw new Error(err);
        });
      } catch (err) {
        fn = requireMap.gwmi();
      } finally {
        if (child) {
          child.kill();
        }
      }
    }
    if (fn === void 0) {
      return callback(new Error(os.platform() + " is not supported yet, please open an issue (https://github.com/soyuka/pidusage)"));
    }
    let single = false;
    if (!Array.isArray(pids)) {
      single = true;
      pids = [pids];
    }
    if (pids.length === 0) {
      return callback(new TypeError("You must provide at least one pid"));
    }
    for (let i = 0; i < pids.length; i++) {
      pids[i] = parseInt(pids[i], 10);
      if (isNaN(pids[i]) || pids[i] < 0) {
        return callback(new TypeError("One of the pids provided is invalid"));
      }
    }
    fn(pids, options, function(err, stats2) {
      if (err) {
        return callback(err);
      }
      if (single) {
        callback(null, stats2[pids[0]]);
      } else {
        callback(null, stats2);
      }
    });
  }
  stats = get;
  return stats;
}
var hasRequiredPidusage;
function requirePidusage() {
  if (hasRequiredPidusage) return pidusage$1.exports;
  hasRequiredPidusage = 1;
  const stats2 = requireStats();
  function pidusage2(pids, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options === void 0) {
      options = {};
    }
    options = Object.assign({
      usePs: /^true$/i.test(process.env.PIDUSAGE_USE_PS),
      maxage: process.env.PIDUSAGE_MAXAGE
    }, options);
    if (typeof callback === "function") {
      stats2(pids, options, callback);
      return;
    }
    return new Promise(function(resolve, reject) {
      stats2(pids, options, function(err, data) {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }
  pidusage$1.exports = pidusage2;
  pidusage$1.exports.clear = requireHistory().clear;
  return pidusage$1.exports;
}
var pidusageExports = requirePidusage();
const pidusage = /* @__PURE__ */ getDefaultExportFromCjs(pidusageExports);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const RUNTIMES_PATH = path.join(app.getPath("userData"), "runtimes");
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch (e) {
      console.error(e);
    }
  }
  return {};
}
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
function getServersRootDir() {
  const config = loadConfig();
  if (config.rootDir && fs.existsSync(config.rootDir)) {
    return config.rootDir;
  }
  const defaultPath = path.join(app.getPath("userData"), "servers");
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
}
function getServersJsonPath() {
  return path.join(getServersRootDir(), "servers.json");
}
function loadServersList() {
  const jsonPath = getServersJsonPath();
  if (!fs.existsSync(jsonPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } catch (e) {
    return [];
  }
}
function saveServersList(servers) {
  const root = getServersRootDir();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  fs.writeFileSync(getServersJsonPath(), JSON.stringify(servers, null, 2), "utf-8");
}
function readServerProperties(filePath) {
  if (!fs.existsSync(filePath)) return /* @__PURE__ */ new Map();
  const content = fs.readFileSync(filePath, "utf-8");
  const properties = /* @__PURE__ */ new Map();
  content.split("\n").forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith("#")) {
      const [key, ...values] = line.split("=");
      if (key) {
        properties.set(key.trim(), values.join("=").trim());
      }
    }
  });
  return properties;
}
function writeServerProperties(filePath, properties) {
  let content = "#Minecraft server properties\n#Edited by MC-Vector\n";
  properties.forEach((value, key) => {
    content += `${key}=${value}
`;
  });
  fs.writeFileSync(filePath, content, "utf-8");
}
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MC-Vector/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { "User-Agent": "MC-Vector/1.0" } }, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 302) {
        return reject(new Error(`Download failed with status code: ${res.statusCode}`));
      }
      const totalSize = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;
      res.pipe(file);
      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round(downloaded / totalSize * 100);
          onProgress(percent);
        }
      });
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(destPath, () => {
      });
      reject(err);
    });
  });
}
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
let mainWindow = null;
let settingsWindow = null;
let tempSettingsData = null;
const activeServers = /* @__PURE__ */ new Map();
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  setInterval(async () => {
    if (activeServers.size === 0) return;
    for (const [serverId, process2] of activeServers) {
      if (process2 && process2.pid) {
        try {
          const stats2 = await pidusage(process2.pid);
          mainWindow?.webContents.send("server-stats", {
            serverId,
            cpu: stats2.cpu,
            memory: stats2.memory
          });
        } catch (e) {
        }
      }
    }
  }, 1e3);
}
app.whenReady().then(() => {
  createWindow();
  const sendLog = (sender, serverId, log) => {
    sender.send("server-log", { serverId, log });
  };
  const sendStatus = (serverId, status) => {
    mainWindow?.webContents.send("server-status-update", { serverId, status });
  };
  ipcMain.handle("get-server-root", async () => getServersRootDir());
  ipcMain.handle("select-root-folder", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "サーバーデータの保存先を選択"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const newPath = result.filePaths[0];
    const config = loadConfig();
    config.rootDir = newPath;
    saveConfig(config);
    return newPath;
  });
  ipcMain.handle("get-servers", async () => {
    const servers = loadServersList();
    return servers.map((s) => ({
      ...s,
      status: activeServers.has(s.id) ? "online" : "offline"
    }));
  });
  ipcMain.handle("add-server", async (_event, serverData) => {
    try {
      const id = require$$0.randomUUID();
      const rootDir = getServersRootDir();
      let folderName = serverData.name.replace(/[\\/:*?"<>|]/g, "").trim();
      if (!folderName) folderName = `server-${id}`;
      let serverDir = path.join(rootDir, folderName);
      if (fs.existsSync(serverDir)) {
        serverDir = path.join(rootDir, `${folderName}-${id.substring(0, 6)}`);
      }
      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }
      const propsPath = path.join(serverDir, "server.properties");
      const props = /* @__PURE__ */ new Map();
      props.set("server-port", serverData.port.toString());
      props.set("motd", `A Minecraft Server - ${serverData.name}`);
      writeServerProperties(propsPath, props);
      fs.writeFileSync(path.join(serverDir, "eula.txt"), "eula=true\n");
      const newServer = {
        id,
        name: serverData.name,
        version: serverData.version,
        software: serverData.software,
        port: serverData.port,
        memory: serverData.memory,
        path: serverDir,
        status: "offline",
        createdDate: (/* @__PURE__ */ new Date()).toISOString()
      };
      const servers = loadServersList();
      servers.push(newServer);
      saveServersList(servers);
      return newServer;
    } catch (e) {
      console.error("Failed to add server:", e);
      throw e;
    }
  });
  ipcMain.handle("update-server", async (_event, updatedServer) => {
    try {
      const servers = loadServersList();
      const index = servers.findIndex((s) => s.id === updatedServer.id);
      if (index !== -1) {
        servers[index] = { ...servers[index], ...updatedServer };
        saveServersList(servers);
        const propsPath = path.join(updatedServer.path, "server.properties");
        if (fs.existsSync(propsPath)) {
          const props = readServerProperties(propsPath);
          props.set("server-port", updatedServer.port.toString());
          writeServerProperties(propsPath, props);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  });
  ipcMain.handle("delete-server", async (_event, serverId) => {
    try {
      if (activeServers.has(serverId)) {
        const process2 = activeServers.get(serverId);
        process2?.kill();
        activeServers.delete(serverId);
      }
      const servers = loadServersList();
      const index = servers.findIndex((s) => s.id === serverId);
      if (index === -1) return false;
      const serverToDelete = servers[index];
      if (serverToDelete.path && fs.existsSync(serverToDelete.path)) {
        try {
          fs.rmSync(serverToDelete.path, { recursive: true, force: true });
        } catch (e) {
          console.error(e);
        }
      }
      servers.splice(index, 1);
      saveServersList(servers);
      return true;
    } catch (e) {
      return false;
    }
  });
  ipcMain.handle("download-server-jar", async (event, serverId) => {
    const servers = loadServersList();
    const server = servers.find((s) => s.id === serverId);
    if (!server) return false;
    const sender = event.sender;
    const sendProgress = (percent, status) => {
      sender.send("download-progress", { serverId, progress: percent, status });
    };
    try {
      sendProgress(0, "URLを取得中...");
      let downloadUrl = "";
      const fileName = "server.jar";
      if (["Paper", "Waterfall", "Velocity", "LeafMC"].includes(server.software)) {
        const projectMap = { "Paper": "paper", "Waterfall": "waterfall", "Velocity": "velocity", "LeafMC": "leaf" };
        const projectId = projectMap[server.software] || "paper";
        const buildListUrl = `https://api.papermc.io/v2/projects/${projectId}/versions/${server.version}`;
        try {
          const buildData = await fetchJson(buildListUrl);
          const latestBuild = buildData.builds[buildData.builds.length - 1];
          const jarName = `${projectId}-${server.version}-${latestBuild}.jar`;
          downloadUrl = `https://api.papermc.io/v2/projects/${projectId}/versions/${server.version}/builds/${latestBuild}/downloads/${jarName}`;
        } catch {
          sendProgress(0, "API未対応。Paperとして試行...");
          const pBuildUrl = `https://api.papermc.io/v2/projects/paper/versions/${server.version}`;
          const pData = await fetchJson(pBuildUrl);
          const pBuild = pData.builds[pData.builds.length - 1];
          downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${server.version}/builds/${pBuild}/downloads/paper-${server.version}-${pBuild}.jar`;
        }
      } else if (server.software === "Vanilla") {
        const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest.json");
        const versionData = manifest.versions.find((v) => v.id === server.version);
        if (versionData) {
          const versionDetails = await fetchJson(versionData.url);
          downloadUrl = versionDetails.downloads.server.url;
        }
      } else if (server.software === "Fabric") {
        const loaderVersions = await fetchJson("https://meta.fabricmc.net/v2/versions/loader");
        const stableLoader = loaderVersions[0].version;
        const installerVersions = await fetchJson("https://meta.fabricmc.net/v2/versions/installer");
        const stableInstaller = installerVersions[0].version;
        downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${server.version}/${stableLoader}/${stableInstaller}/server/jar`;
      }
      if (!downloadUrl) throw new Error(`${server.software} (${server.version}) のダウンロードリンクが見つかりません。`);
      sendProgress(0, "ダウンロード中...");
      const destPath = path.join(server.path, fileName);
      await downloadFile(downloadUrl, destPath, (percent) => sendProgress(percent, "ダウンロード中..."));
      sendProgress(100, "完了");
      return true;
    } catch (error) {
      console.error("Download error:", error);
      sendProgress(0, `エラー: ${error.message}`);
      return false;
    }
  });
  ipcMain.handle("setup-proxy", async (_event, config) => {
    const { proxySoftware, proxyPort, backendServerIds } = config;
    try {
      const rootDir = getServersRootDir();
      const proxyPath = path.join(rootDir, "Proxy-Server");
      if (!fs.existsSync(proxyPath)) fs.mkdirSync(proxyPath, { recursive: true });
      let velocityServersConfig = "[servers]\n";
      let tryOrder = "try = [";
      const allServers = loadServersList();
      for (const serverId of backendServerIds) {
        const targetServer = allServers.find((s) => s.id === serverId);
        if (targetServer && fs.existsSync(targetServer.path)) {
          const propFile = path.join(targetServer.path, "server.properties");
          if (fs.existsSync(propFile)) {
            const props = readServerProperties(propFile);
            props.set("online-mode", "false");
            writeServerProperties(propFile, props);
          }
          const cleanName = targetServer.name.replace(/[^a-zA-Z0-9]/g, "");
          velocityServersConfig += `${cleanName} = "127.0.0.1:${targetServer.port}"
`;
          tryOrder += `"${cleanName}", `;
        }
      }
      tryOrder = tryOrder.replace(/, $/, "") + "]";
      if (proxySoftware === "Velocity") {
        const velocityToml = `bind = "0.0.0.0:${proxyPort}"
show-max-players = 500
online-mode = true
force-key-authentication = true
player-info-forwarding-mode = "modern"
forwarding-secret-file = "forwarding.secret"
announ-forwarding-secret = true

${velocityServersConfig}

${tryOrder}`;
        fs.writeFileSync(path.join(proxyPath, "velocity.toml"), velocityToml);
      } else {
        const configYml = `listeners:
- query_port: ${proxyPort}
  host: 0.0.0.0:${proxyPort}
  max_players: 1
online_mode: true
ip_forward: true
servers:
  # Auto-generated`;
        fs.writeFileSync(path.join(proxyPath, "config.yml"), configYml);
      }
      return { success: true, message: `プロキシ設定を作成しました。
場所: ${proxyPath}` };
    } catch (err) {
      return { success: false, message: `エラー: ${err.message}` };
    }
  });
  ipcMain.on("start-server", (event, serverId) => {
    if (activeServers.has(serverId)) return;
    const servers = loadServersList();
    const server = servers.find((s) => s.id === serverId);
    if (!server || !server.path) return;
    const sender = event.sender;
    const jarPath = path.join(server.path, "server.jar");
    if (!fs.existsSync(jarPath)) {
      sendLog(sender, serverId, `[ERROR] server.jarが見つかりません。ダウンロードしてください。`);
      return;
    }
    sendLog(sender, serverId, `[INFO] Starting Server: ${server.name} (${server.version})...`);
    sendStatus(serverId, "online");
    const minMem = "1G";
    const maxMem = `${server.memory || 4}G`;
    let javaCommand = server.javaPath ? server.javaPath : "java";
    if (server.javaPath && !fs.existsSync(server.javaPath) && server.javaPath !== "java") {
      sendLog(sender, serverId, `[WARNING] Custom Java path not found: ${server.javaPath}. Falling back to system 'java'.`);
      javaCommand = "java";
    }
    const javaProcess = spawn(javaCommand, [`-Xms${minMem}`, `-Xmx${maxMem}`, "-jar", "server.jar", "nogui"], {
      cwd: server.path
    });
    activeServers.set(serverId, javaProcess);
    javaProcess.stdout.on("data", (data) => sendLog(sender, serverId, data.toString()));
    javaProcess.stderr.on("data", (data) => sendLog(sender, serverId, data.toString()));
    javaProcess.on("close", (code2) => {
      sendLog(sender, serverId, `[INFO] Server stopped with exit code ${code2}`);
      activeServers.delete(serverId);
      sendStatus(serverId, "offline");
    });
    javaProcess.on("error", (err) => {
      sendLog(sender, serverId, `[ERROR] Failed to start process: ${err.message}`);
      activeServers.delete(serverId);
      sendStatus(serverId, "offline");
    });
  });
  ipcMain.on("stop-server", (event, serverId) => {
    const process2 = activeServers.get(serverId);
    if (process2) {
      sendLog(event.sender, serverId, "[INFO] Sending stop command...");
      process2.stdin?.write("stop\n");
      sendStatus(serverId, "stopping");
    } else {
      sendLog(event.sender, serverId, "[INFO] Server is not running.");
    }
  });
  ipcMain.on("send-command", (event, { serverId, command }) => {
    const process2 = activeServers.get(serverId);
    if (process2) {
      sendLog(event.sender, serverId, `> ${command}`);
      process2.stdin?.write(`${command}
`);
    } else {
      sendLog(event.sender, serverId, "[ERROR] Server is not running.");
    }
  });
  ipcMain.on("open-settings-window", (_event, currentSettings) => {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }
    tempSettingsData = currentSettings;
    settingsWindow = new BrowserWindow({
      width: 900,
      height: 700,
      parent: mainWindow || void 0,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname$1, "preload.mjs"),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    if (process.env.VITE_DEV_SERVER_URL) {
      settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#settings`);
    } else {
      settingsWindow.loadURL(`file://${path.join(__dirname$1, "../dist/index.html")}#settings`);
    }
    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
  });
  ipcMain.on("settings-window-ready", (event) => {
    if (tempSettingsData) {
      event.sender.send("init-settings-data", tempSettingsData);
    }
  });
  ipcMain.on("save-settings-from-window", (_event, newSettings) => {
    if (mainWindow) {
      mainWindow.webContents.send("settings-updated", newSettings);
    }
  });
  ipcMain.handle("list-files", async (_event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return [];
      const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return dirents.map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory()
      })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
    } catch {
      return [];
    }
  });
  ipcMain.handle("read-file", async (_event, filePath) => {
    try {
      return await fs.promises.readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  });
  ipcMain.handle("save-file", async (_event, filePath, content) => {
    try {
      await fs.promises.writeFile(filePath, content, "utf-8");
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("create-directory", async (_event, dirPath) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("delete-path", async (_event, targetPath) => {
    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("move-path", async (_event, srcPath, destPath) => {
    try {
      await fs.promises.rename(srcPath, destPath);
      return true;
    } catch {
      try {
        await fs.promises.cp(srcPath, destPath, { recursive: true });
        await fs.promises.rm(srcPath, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
  });
  ipcMain.handle("upload-files", async (_event, filePaths, destDir) => {
    try {
      for (const src of filePaths) {
        const fileName = path.basename(src);
        const dest = path.join(destDir, fileName);
        await fs.promises.cp(src, dest, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("compress-files", async (_event, filePaths, destPath) => {
    try {
      const zip = new AdmZip();
      for (const filePath of filePaths) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          zip.addLocalFolder(filePath, path.basename(filePath));
        } else {
          zip.addLocalFile(filePath);
        }
      }
      zip.writeZip(destPath);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("extract-archive", async (_event, archivePath, destPath) => {
    try {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(destPath, true);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("create-backup", async (_event, _id, serverPath) => {
    try {
      if (!fs.existsSync(serverPath)) return false;
      const backupsDir = path.join(serverPath, "backups");
      if (!fs.existsSync(backupsDir)) {
        await fs.promises.mkdir(backupsDir);
      }
      const zip = new AdmZip();
      const files = await fs.promises.readdir(serverPath);
      files.forEach((f) => {
        if (f === "backups") return;
        const p = path.join(serverPath, f);
        if (fs.statSync(p).isDirectory()) {
          zip.addLocalFolder(p, f);
        } else {
          zip.addLocalFile(p);
        }
      });
      zip.writeZip(path.join(backupsDir, `backup-${Date.now()}.zip`));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("list-backups", async (_event, serverPath) => {
    try {
      const dir = path.join(serverPath, "backups");
      if (!fs.existsSync(dir)) return [];
      const files = await fs.promises.readdir(dir);
      const res = [];
      for (const f of files) {
        if (f.endsWith(".zip")) {
          const s = await fs.promises.stat(path.join(dir, f));
          res.push({ name: f, date: s.mtime, size: s.size });
        }
      }
      return res.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch {
      return [];
    }
  });
  ipcMain.handle("restore-backup", async (_event, serverPath, backupName) => {
    try {
      const p = path.join(serverPath, "backups", backupName);
      if (!fs.existsSync(p)) return false;
      const zip = new AdmZip(p);
      zip.extractAllTo(serverPath, true);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("delete-backup", async (_event, serverPath, backupName) => {
    try {
      const p = path.join(serverPath, "backups", backupName);
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });
  ipcMain.handle("search-modrinth", async (_event, query, type, version, offset = 0) => {
    try {
      const projectType = type === "plugin" ? "plugin" : "mod";
      const facets = JSON.stringify([
        [`project_type:${projectType}`],
        [`versions:${version}`]
      ]);
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=30&offset=${offset}&index=downloads`;
      const result = await fetchJson(url);
      return result.hits || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  ipcMain.handle("install-modrinth-project", async (_event, _projectId, _versionId, fileName, downloadUrl, serverPath, type) => {
    try {
      const folderName = type === "plugin" ? "plugins" : "mods";
      const targetDir = path.join(serverPath, folderName);
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }
      const destPath = path.join(targetDir, fileName);
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(downloadUrl, { headers: { "User-Agent": "MC-Vector/1.0" } }, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 302) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }).on("error", (err) => {
          fs.unlink(destPath, () => {
          });
          reject(err);
        });
      });
      return true;
    } catch (e) {
      console.error("Install failed:", e);
      return false;
    }
  });
  ipcMain.handle("search-hangar", async (_event, query, _version, offset = 0) => {
    try {
      const url = `https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(query)}&limit=30&offset=${offset}&sort=-stars`;
      const result = await fetchJson(url);
      return result.result || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  ipcMain.handle("install-hangar-project", async (_event, downloadUrl, fileName, serverPath) => {
    try {
      const targetDir = path.join(serverPath, "plugins");
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }
      const destPath = path.join(targetDir, fileName);
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(downloadUrl, { headers: { "User-Agent": "MC-Vector/1.0" } }, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 302) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }).on("error", reject);
      });
      return true;
    } catch (e) {
      return false;
    }
  });
  ipcMain.handle("get-java-versions", async () => {
    if (!fs.existsSync(RUNTIMES_PATH)) return [];
    const dirs = await fs.promises.readdir(RUNTIMES_PATH, { withFileTypes: true });
    const javaList = [];
    const isWin = process.platform === "win32";
    const binName = isWin ? "java.exe" : "java";
    for (const d of dirs) {
      if (d.isDirectory()) {
        const fullPath = path.join(RUNTIMES_PATH, d.name);
        let binPath = path.join(fullPath, "bin", binName);
        if (!fs.existsSync(binPath) && process.platform === "darwin") {
          const macPath = path.join(fullPath, "Contents", "Home", "bin", binName);
          if (fs.existsSync(macPath)) {
            binPath = macPath;
          }
        }
        if (fs.existsSync(binPath)) {
          const match = d.name.match(/jdk-?(\d+)/);
          const version = match ? parseInt(match[1]) : 0;
          javaList.push({
            name: d.name,
            path: binPath,
            version
          });
        }
      }
    }
    return javaList.sort((a, b) => b.version - a.version);
  });
  ipcMain.handle("download-java", async (event, version) => {
    const sender = event.sender;
    const sendProgress = (percent) => {
      sender.send("download-progress", { serverId: "java-install", progress: percent, status: `Downloading Java ${version}...` });
    };
    try {
      const isWin = process.platform === "win32";
      const isMac = process.platform === "darwin";
      let osStr = "linux";
      if (isWin) osStr = "windows";
      if (isMac) osStr = "mac";
      let archStr = "x64";
      if (process.arch === "arm64") archStr = "aarch64";
      const ext = isWin ? "zip" : "tar.gz";
      const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${osStr}/${archStr}/jdk/hotspot/normal/eclipse?project=jdk`;
      if (!fs.existsSync(RUNTIMES_PATH)) await fs.promises.mkdir(RUNTIMES_PATH, { recursive: true });
      const downloadPath = path.join(RUNTIMES_PATH, `java-${version}.${ext}`);
      await downloadFile(url, downloadPath, sendProgress);
      sendProgress(100);
      sender.send("download-progress", { serverId: "java-install", progress: 100, status: `Extracting Java ${version}...` });
      if (isWin) {
        const zip = new AdmZip(downloadPath);
        zip.extractAllTo(RUNTIMES_PATH, true);
      } else {
        await extract({
          file: downloadPath,
          cwd: RUNTIMES_PATH
        });
      }
      await fs.promises.unlink(downloadPath);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });
  ipcMain.handle("delete-java", async (_event, version) => {
    try {
      const dirs = await fs.promises.readdir(RUNTIMES_PATH);
      for (const d of dirs) {
        if (d.includes(`jdk-${version}`) || d.includes(`jdk${version}`)) {
          await fs.promises.rm(path.join(RUNTIMES_PATH, d), { recursive: true, force: true });
        }
      }
      return true;
    } catch {
      return false;
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
