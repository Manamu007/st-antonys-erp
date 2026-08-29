console.log("Environment variables containing credentials or project Info:");
for (const key of Object.keys(process.env)) {
  if (key.match(/google|firebase|gkey|cred|auth|token|project/i)) {
    console.log(`- ${key}: ${key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('cred') ? '***[HIDDEN]***' : process.env[key]}`);
  }
}
process.exit(0);
