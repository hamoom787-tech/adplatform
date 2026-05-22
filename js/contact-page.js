document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = document.getElementById('name')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const subject = document.getElementById('subject')?.value;

    if (name && email && subject) {
      showContactToast('شكرا! تم استلام رسالتك. سنرد عليك قريبا.', 'success');
      form.reset();
      return;
    }

    showContactToast('يرجى ملء جميع الحقول المطلوبة.', 'error');
  });
});

function showContactToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const isSuccess = type === 'success';
  const toast = document.createElement('div');
  toast.style.cssText = `
    padding: 16px 24px;
    margin-bottom: 12px;
    border-radius: 8px;
    background: ${isSuccess ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};
    border: 1px solid ${isSuccess ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
    color: ${isSuccess ? '#22c55e' : '#ef4444'};
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
