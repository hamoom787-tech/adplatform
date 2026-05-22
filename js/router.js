/* ============================================================
   router.js — موجه الصفحات ونظام التحقق من الصلاحيات والتوجيه التلقائي
   ============================================================ */

'use strict';

const Router = {
  // الحصول على المستخدم الحالي من الجلسة أو الذاكرة الدائمة
  getCurrentUser() {
    if (window.Auth && typeof window.Auth.getCurrentUser === 'function') {
      return window.Auth.getCurrentUser();
    }
    return null;
  },

  // التحقق والتوجيه بناءً على الصفحة الحالية وصلاحيات المستخدم
  checkAccess() {
    const path = window.location.pathname.toLowerCase();
    const user = this.getCurrentUser();
    
    const isAdminPage = path.includes('/admin/');
    const isLoginPage = path.endsWith('/login.html') || path.endsWith('\\login.html');
    const isRegisterPage = path.endsWith('/register.html') || path.endsWith('\\register.html');
    const isPublicLegalPage = [
      '/privacy-policy.html',
      '/terms-of-service.html',
      '/contact-us.html',
      '/dmca.html'
    ].some(page => path.endsWith(page) || path.endsWith(page.replace('/', '\\')));
    const isLandingPage = path.endsWith('/index.html') || path.endsWith('\\index.html') || path.endsWith('/') || (!isLoginPage && !isRegisterPage && !isAdminPage && !path.includes('.html'));

    // صفحات الأعضاء المحمية (غير اللاندينج، وغير اللوجين، وغير الريجستير، وغير الأدمن)
    const isUserProtectedPage = !isLandingPage && !isLoginPage && !isRegisterPage && !isAdminPage && !isPublicLegalPage;

    if (user) {
      // إذا كان المستخدم محظوراً، قم بتسجيل خروجه فوراً
      if (user.status === 'banned') {
        this.forceLogout();
        return;
      }

      // إذا كان العضو مسجل دخول ومحاول الدخول لصفحة دخول/تسجيل/هبوط
      if (isLoginPage || isRegisterPage) {
        if (window.Auth?.isAdmin?.()) {
          this.redirect(isAdminPage ? 'index.html' : 'admin/index.html');
        } else {
          this.redirect('dashboard.html');
        }
        return;
      }

      // إذا كان مستخدماً عادياً ويحاول الدخول لصفحات الأدمن
      if (isAdminPage && !window.Auth?.isAdmin?.()) {
        this.redirect('../dashboard.html');
        return;
      }
    } else {
      // إذا لم يكن هناك مستخدم مسجل دخول
      if (isUserProtectedPage) {
        this.redirect('login.html');
        return;
      }
      if (isAdminPage) {
        this.redirect('../login.html');
        return;
      }
    }
  },

  // دالة المساعدة للتوجيه بمرونة وتوافق مع كافة البيئات و file://
  redirect(target) {
    const path = window.location.pathname.toLowerCase();
    const isAdminPage = path.includes('/admin/');
    
    let redirectPath = target;
    // إذا كنا داخل مجلد admin ونريد التوجيه لصفحة في المجلد الرئيسي
    if (isAdminPage && !target.startsWith('../') && (target.endsWith('login.html') || target.endsWith('dashboard.html') || target.endsWith('register.html'))) {
      redirectPath = '../' + target;
    }
    
    // إذا كنا في المجلد الرئيسي ونريد التوجيه لصفحة داخل admin
    if (!isAdminPage && target.startsWith('admin/') && (path.endsWith('login.html') || path.endsWith('register.html') || path.endsWith('index.html') || path.endsWith('/'))) {
      redirectPath = target;
    }

    window.location.href = redirectPath;
  },

  // تسجيل خروج إجباري في حال حظر المستخدم
  forceLogout() {
    if (window.Auth && typeof window.Auth.logout === 'function') {
      window.Auth.logout();
      return;
    }
    alert('تم إيقاف حسابك من قبل الإدارة. يرجى الاتصال بالدعم.');
    
    const path = window.location.pathname.toLowerCase();
    const isAdminPage = path.includes('/admin/');
    window.location.href = isAdminPage ? '../login.html' : 'login.html';
  }
};

// تشغيل التحقق بعد استقرار Firebase Auth حتى لا يتم تحويل المستخدم قبل تحميل الجلسة.
if (window.Auth && typeof window.Auth.ready === 'function') {
  window.Auth.ready().then(() => Router.checkAccess());
} else {
  Router.checkAccess();
}
window.Router = Router;
