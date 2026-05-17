const https = require("https");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const { pcode, flno, kw } = event.queryStringParameters || {};

  let apiUrl;
  if (kw) {
    apiUrl = `https://law.moj.gov.tw/api/Ch/Law/Query?kw=${encodeURIComponent(kw)}`;
  } else if (pcode && flno) {
    apiUrl = `https://law.moj.gov.tw/api/Ch/Law/Article?pcode=${encodeURIComponent(pcode)}&flno=${encodeURIComponent(flno)}`;
  } else {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "missing_params" }),
    };
  }

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(apiUrl, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error("parse_error")); }
        });
      }).on("error", reject);
    });

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
