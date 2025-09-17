 document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      };
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) {
        localStorage.setItem('user', JSON.stringify(json)); 
        window.location = '/index.html'; // go to main app
      } else {
        document.getElementById('error').innerText = json.error || 'Login failed';
      }
    });