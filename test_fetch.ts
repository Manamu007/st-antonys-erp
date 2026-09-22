async function run() {
  try {
    const start = Date.now();
    const res = await fetch("https://antonyschool.in/api/maintenance/db-proxy?collection=students", {
      signal: AbortSignal.timeout(8000)
    });
    console.log("Fetch took", Date.now() - start, "ms");
    console.log("Response status:", res.status);
    const contentType = res.headers.get("content-type") || "";
    console.log("Response content-type:", contentType);
    if (res.ok && contentType.includes("application/json")) {
      const data = await res.json();
      console.log("Is array?", Array.isArray(data));
      if (Array.isArray(data)) {
        console.log("Count:", data.length);
      } else {
        console.log("Count in data:", data.data?.length, "success:", data.success);
      }
    } else {
      console.log("Response is not JSON or not OK");
    }
  } catch (err: any) {
    console.error("Fetch error:", err.message);
  }
}
run();
