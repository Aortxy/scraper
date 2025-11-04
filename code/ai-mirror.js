import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

class Helper {
  static BASE_URL = "https://be.aimirror.fun";
  static UID = this.generateRandomHash();
  static HEADERS = {
    'User-Agent': 'AIMirror/6.8.4+179 (android)',
    'store': 'googleplay',
    'uid': this.UID,
    'env': 'PRO',
    'accept-language': 'en',
    'accept-encoding': 'gzip',
    'package-name': 'com.ai.polyverse.mirror',
    'host': 'be.aimirror.fun',
    'content-type': 'application/json',
    'app-version': '6.8.4+179'
  };

  static hash = "";
  static imageKey = "";
  static log = false;

  static logMsg(processName, msg) {
    if (this.log) {
      console.log(`[${processName}] ${msg}`);
    }
  }

  /**
   * @param {string} str input string to be hashed
   * @returns {string} hex SHA-1
   */
  static sha1FromString(str) {
    if (!str || typeof str !== "string") throw new Error("Invalid input for sha1FromString");
    return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
  }

  /**
   * @param {string} hexHash
   * @param {string} [ext='.jpg'] optional extension
   * @returns {string} combine hash and extension
   */
  static withExt(hexHash, ext = '.jpg') {
    if (!hexHash) throw new Error("Invalid hash for withExt");
    return `${hexHash}${ext}`;
  }

  /**
   * @param {string} imageUrl
   * @param {object} [headers] optional headers
   * @returns {Promise<Buffer>} image buffer from URL
   */
  static async urlToBuffer(imageUrl, headers = {}) {
    if (!imageUrl || typeof imageUrl !== "string") throw new Error("Invalid imageUrl");
    try {
      const res = await axios.get(imageUrl, { responseType: 'arraybuffer', headers, timeout: 20000 });
      return Buffer.from(res.data);
    } catch (err) {
      throw new Error(`urlToBuffer failed: ${err.message}`);
    }
  }

  /**
   * generate 16 char random hex string
   * @returns {string}
   */
  static generateRandomHash() {
    const hexChars = "0123456789abcdef";
    return Array.from({ length: 16 }, () => hexChars[Math.floor(Math.random() * hexChars.length)]).join("");
  }

  /**
   * Fetch token from AIMirror server
   * @returns {Promise<object>} token data (key etc.)
   */
  static async fetchAppToken() {
    if (!this.hash) throw new Error("Helper.hash must be set before fetchAppToken");
    const url = `${this.BASE_URL}/app_token/v2`;
    const params = { cropped_image_hash: this.withExt(this.hash), uid: this.UID };
    this.logMsg("fetchAppToken", `Params: ${JSON.stringify(params)}`);

    try {
      const res = await axios.get(url, { params, headers: this.HEADERS, timeout: 10000 });
      this.logMsg("fetchAppToken", `Response received`);
      return res.data;
    } catch (err) {
      throw new Error(`fetchAppToken failed: ${err.response?.status || ""} ${err.message}`);
    }
  }

  /**
   * Upload buffer to OSS
   * @param {object} payload data upload, including file buffer
   * @returns {Promise<object>} response upload
   */
  static async uploadPhoto(payload) {
    const requiredFields = ["name", "key", "policy", "OSSAccessKeyId", "success_action_status", "signature", "backend_type", "region", "file", "upload_host"];
    for (const f of requiredFields) if (!(f in payload)) throw new Error(`uploadPhoto: missing field ${f}`);

    const body = new FormData();
    body.append("name", payload.name);
    body.append("key", payload.key);
    body.append("policy", payload.policy);
    body.append("OSSAccessKeyId", payload.OSSAccessKeyId);
    body.append("success_action_status", payload.success_action_status);
    body.append("signature", payload.signature);
    body.append("backend_type", payload.backend_type);
    body.append("region", payload.region);
    body.append("file", payload.file, { filename: this.withExt(this.hash), contentType: "application/octet-stream" });

    const headers = { "User-Agent": "Dart/3.6 (dart:io)", "Accept-Encoding": "gzip" };

    try {
      const res = await axios.post(payload.upload_host, body, {
        headers: { ...body.getHeaders(), ...headers },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 10000
      });
      this.logMsg("uploadPhoto", `Upload successful`);
      return res.data;
    } catch (err) {
      throw new Error(`uploadPhoto failed: ${err.response?.status || ""} ${err.message}`);
    }
  }

  /**
   * Request generate image
   * @param {object} payload optional parameter draw
   * @returns {Promise<object>} data response draw
   */
  static async requestDraw(payload = {}) {
    const url = `${this.BASE_URL}/draw?uid=${this.UID}`;
    const data = {
      model_id: payload.model_id || 204,
      cropped_image_key: this.imageKey,
      cropped_height: payload.cropped_height || 1024,
      cropped_width: payload.cropped_width || 768,
      package_name: "com.ai.polyverse.mirror",
      ext_args: {
        imagine_value2: payload.imagine_value2 || 50,
        custom_prompt: payload.custom_prompt || ""
      },
      version: "6.8.4",
      force_default_pose: payload.force_default_pose || false,
      is_free_trial: payload.is_free_trial || true
    };
    this.logMsg("requestDraw", `Request data: ${JSON.stringify(data)}`);

    try {
      const res = await axios.post(url, data, { headers: this.HEADERS, timeout: 20000, validateStatus: () => true });
      this.logMsg("requestDraw", `Response received`);
      return res.data;
    } catch (err) {
      throw new Error(`requestDraw failed: ${err.message}`);
    }
  }

  /**
   * Poll status draw until finished
   * @param {string} draw_request_id
   * @param {number} delaySec delay per poll
   * @returns {Promise<string[]>} result
   */
  static async waitForDraw(draw_request_id, delaySec = 7) {
    if (!draw_request_id) throw new Error("waitForDraw: draw_request_id is required");
    const url = `${this.BASE_URL}/draw/process`;

    while (true) {
      try {
        const res = await axios.get(url, { headers: this.HEADERS, params: { draw_request_id, uid: this.UID }, timeout: 15000 });
        const data = res.data;
        this.logMsg("waitForDraw", `Progress: ${(data.progress.process * 100).toFixed(2)}%, Status: ${data.draw_status}`);

        if (data.draw_status === "SUCCEED") {
          this.logMsg("waitForDraw", `Draw succeeded`);
          return data.generated_image_addresses;
        } else if (data.draw_status === "FAILED") {
          throw new Error("Draw failed");
        } else {
          await new Promise(r => setTimeout(r, delaySec * 1000));
        }
      } catch (err) {
        this.logMsg("waitForDraw", `Error polling: ${err.message}`);
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    }
  }
}

/**
   * Generate the image
   * @param {object} hyperParameter The settings
   * @param {number} delaySec delay each poll
   * @param {boolean} log log?
   * @returns {Promise<string[]>} result
   */
async function create(hyperParameter = {}, delaySec = 7, log = false) {
  if (typeof delaySec !== "number" || delaySec <= 0) throw new Error("Invalid delaySec");
  Helper.log = log;

  try {
    Helper.hash = Helper.sha1FromString(crypto.randomUUID());
    Helper.logMsg("create", `Generated hash: ${Helper.hash}`);
    Helper.logMsg("create", `UID: ${Helper.UID}`);

    const appToken = await Helper.fetchAppToken();
    Helper.imageKey = appToken.key;
    Helper.logMsg("create", `Fetched app token key: ${Helper.imageKey}`);

    const bufferImage = await Helper.urlToBuffer(hyperParameter.image);
    Helper.logMsg("create", `Downloaded image size: ${bufferImage.length} bytes`);
    appToken.file = bufferImage;

    const upload = await Helper.uploadPhoto(appToken);
    Helper.logMsg("create", `Upload response received`);

    const generate = await Helper.requestDraw(hyperParameter);
    Helper.logMsg("create", JSON.stringify(generate));
    Helper.logMsg("create", `Draw request ID: ${generate.draw_request_id}`);

    const images = await Helper.waitForDraw(generate.draw_request_id, delaySec);
    Helper.logMsg("create", `Generated image URLs: ${images}`);

    return images;
  } catch (error) {
    console.error(`[create] Error: ${error.message}`);
    return null;
  }
}

/**
 * How to do it? Here's how
 * The number 7 in the second create parameter means the delay waiting request (in seconds)
 */
const hyperParameter = {
  model_id: 271,
  cropped_height: 1024,
  cropped_width: 768,
  imagine_value2: 50,
  custom_prompt: "",
  force_default_pose: false,
  is_free_trial: true,
  image: "https://i.pinimg.com/736x/92/24/9a/92249ad035a368a1835feba32f66a484.jpg"
}
create(hyperParameter, 7, true).then(result => console.log("[create] Final result:", result));
