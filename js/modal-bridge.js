/* ============================================================
   modal-bridge.js - early modal event delegation
   ============================================================ */

'use strict';

(function initModalBridge() {
  const getAddAdModal = () => document.getElementById('modal-add-ad');

  function openAddAdModal() {
    const modal = getAddAdModal();
    if (!modal) return false;
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open', 'active', 'show');
    return true;
  }

  function closeAddAdModal() {
    const modal = getAddAdModal();
    if (!modal) return false;
    modal.classList.remove('open', 'active', 'show');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.removeProperty('display');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('pointer-events');
    return true;
  }

  document.addEventListener('click', (event) => {
    const openBtn = event.target.closest?.('#open-add-ad-btn');
    if (openBtn) {
      event.preventDefault();
      openAddAdModal();
      return;
    }

    const closeBtn = event.target.closest?.('#close-add-ad-modal');
    if (closeBtn) {
      event.preventDefault();
      closeAddAdModal();
      return;
    }

    if (event.target && event.target.id === 'modal-add-ad') {
      closeAddAdModal();
    }
  });

  window.ModalBridge = {
    openAddAdModal,
    closeAddAdModal
  };
})();
