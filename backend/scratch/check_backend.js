async function check() {
  try {
    const res = await fetch('http://localhost:3001/api/health');
    const data = await res.json();
    console.log("Backend check successful:", data);
  } catch (err) {
    console.log("Backend check failed (it might not be running):", err.message);
  }
}

check();
