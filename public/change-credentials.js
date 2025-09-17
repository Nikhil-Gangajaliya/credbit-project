document.getElementById('changeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        oldUsername: document.getElementById('oldUsername').value,
        oldPassword: document.getElementById('oldPassword').value,
        newUsername: document.getElementById('newUsername').value,
        newPassword: document.getElementById('newPassword').value
      };
      const res = await fetch('/api/change-credentials', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(body)
      });
      const json = await res.json();
      const msg = document.getElementById('msg');
      if (json.ok) {
        msg.style.color = 'green';
        msg.innerText = json.message;
        localStorage.removeItem('user');
        setTimeout(()=> window.location='/login.html', 2000);
      } else {
        msg.style.color = 'red';
        msg.innerText = json.error || 'Update failed';
      }
    });