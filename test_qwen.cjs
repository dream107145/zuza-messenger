const http = require('http');

const payload = JSON.stringify({
  model: "qwen3.5:9b",
  messages: [
    { role: "system", content: "Jesteś Zuza. Pisz naturalnie." },
    { role: "user", content: "hejka" }
  ],
  stream: false,
  options: {
    num_predict: 200,
    temperature: 0.75,
    top_p: 0.9,
    stop: [
      "<|eot_id|>",
      "<|end_of_text|>",
      "<|im_end|>",
      "</s>",
      "Znajomy:",
      "user:",
      "\\nZnajomy:",
      "\\nuser:",
      "[/]",
      "[/INST]",
      "[INST]"
    ]
  }
});

const req = http.request({
  hostname: 'localhost',
  port: 11434,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log("HTTP Status:", res.statusCode);
    console.log("Response Data:", data);
  });
});

req.on('error', (e) => console.error(e));
req.write(payload);
req.end();
