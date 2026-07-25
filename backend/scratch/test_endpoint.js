async function test() {
  try {
    console.log("Testing new endpoint...");
    const res = await fetch('http://localhost:3001/api/etsy/listings-with-variations');
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Response data:", data);
  } catch (err) {
    console.log("Endpoint call failed:", err.message);
  }
}

test();
