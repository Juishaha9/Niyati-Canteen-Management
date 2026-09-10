<?php
use App\Auth\Auth; use App\Helpers\Csrf; use App\Helpers\View;

$view = $_GET['view'] ?? 'login';
if (!in_array($view, ['login', 'forgot'], true)) $view = 'login';

$errorMsg = View::flash('error');
$successMsg = View::flash('success');
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0060FF"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/assets/app.css"><title>Sign in — Niyati Canteen</title></head>
<body class="login-body" data-view="<?=View::esc($view)?>">
  <div class="login-orb login-orb-a"></div>
  <div class="login-orb login-orb-b"></div>

  <main class="login-wrap">
    <div class="login-card">
      <img class="login-logo" src="/icons/logo.png" alt="Niyati Canteen">

      <!-- LOGIN PANEL -->
      <section class="login-panel-view" id="panel-login" <?=$view==='login'?'':'hidden'?>>
        <div class="login-illustration" aria-hidden="true">
          <svg viewBox="0 0 160 160" width="104" height="104">
            <circle cx="80" cy="80" r="70" fill="var(--lp-blue-soft)"/>
            <g class="illus-float">
              <path d="M80 30 L120 45 V80 C120 108 103 128 80 138 C57 128 40 108 40 80 V45 Z" fill="url(#illusShield)"/>
              <path d="M62 82 L75 95 L100 65" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </g>
            <circle class="illus-dot d1" cx="32" cy="38" r="5" fill="var(--lp-blue-light)"/>
            <circle class="illus-dot d2" cx="132" cy="116" r="7" fill="var(--lp-blue)"/>
            <circle class="illus-dot d3" cx="126" cy="34" r="4" fill="var(--lp-blue-light)"/>
            <defs><linearGradient id="illusShield" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lp-blue-light)"/><stop offset="1" stop-color="var(--lp-blue)"/></linearGradient></defs>
          </svg>
        </div>
        <p class="eyebrow">Welcome back</p>
        <h1>Sign in to continue</h1>
        <p class="muted">Manage tables, orders and bills.</p>

        <?php if ($view==='login' && $errorMsg): ?><div class="alert error"><?=View::esc($errorMsg)?></div><?php endif; ?>
        <?php if ($view==='login' && $successMsg): ?><div class="alert success"><?=View::esc($successMsg)?></div><?php endif; ?>

        <form method="post" class="login-form" autocomplete="on">
          <input type="hidden" name="action" value="login">
          <input type="hidden" name="_csrf" value="<?=Csrf::token()?>">
          <label class="field">
            <span>Email</span>
            <span class="field-input">
              <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" opacity="0"/><path d="M22 6 12 13 2 6"/><path d="M2 6h20v12H2z"/></svg>
              <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required autofocus>
            </span>
          </label>
          <label class="field">
            <span>Password</span>
            <span class="field-input">
              <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" name="password" id="login-password" autocomplete="current-password" placeholder="••••••••" required>
              <button type="button" class="field-toggle" data-toggle-for="login-password" aria-label="Show password">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </span>
          </label>
          <button class="primary login-submit" type="submit"><span>Sign in</span></button>
          <button type="button" class="link-btn login-forgot-link" data-goto="forgot">Forgot password?</button>
        </form>
      </section>

      <!-- FORGOT PASSWORD PANEL -->
      <section class="login-panel-view" id="panel-forgot" <?=$view==='forgot'?'':'hidden'?>>
        <button type="button" class="back-btn" data-goto="login" aria-label="Back to sign in">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div class="login-illustration" aria-hidden="true">
          <svg viewBox="0 0 160 160" width="96" height="96">
            <circle cx="80" cy="80" r="70" fill="var(--lp-blue-soft)"/>
            <g class="illus-float">
              <path d="M58 72 V58 a22 22 0 0 1 44 0 v14" fill="none" stroke="var(--lp-blue)" stroke-width="9" stroke-linecap="round"/>
              <rect x="48" y="70" width="64" height="52" rx="12" fill="url(#illusLock)"/>
              <circle cx="80" cy="92" r="8" fill="#fff"/>
              <rect x="76" y="96" width="8" height="16" rx="4" fill="#fff"/>
            </g>
            <circle class="illus-dot d1" cx="32" cy="44" r="5" fill="var(--lp-blue-light)"/>
            <circle class="illus-dot d2" cx="130" cy="114" r="7" fill="var(--lp-blue)"/>
            <circle class="illus-dot d3" cx="124" cy="40" r="4" fill="var(--lp-blue-light)"/>
            <defs><linearGradient id="illusLock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lp-blue-light)"/><stop offset="1" stop-color="var(--lp-blue)"/></linearGradient></defs>
          </svg>
        </div>
        <p class="eyebrow">Reset password</p>
        <h1>Forgot password?</h1>
        <p class="muted">Enter your email and choose a new password.</p>

        <?php if ($view==='forgot' && $errorMsg): ?><div class="alert error"><?=View::esc($errorMsg)?></div><?php endif; ?>
        <?php if ($view==='forgot' && $successMsg): ?><div class="alert success"><?=View::esc($successMsg)?></div><?php endif; ?>

        <form method="post" class="login-form">
          <input type="hidden" name="action" value="forgot_password">
          <input type="hidden" name="_csrf" value="<?=Csrf::token()?>">
          <label class="field">
            <span>Email</span>
            <span class="field-input">
              <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 6 12 13 2 6"/><path d="M2 6h20v12H2z"/></svg>
              <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required <?=$view==='forgot'?'autofocus':''?>>
            </span>
          </label>
          <label class="field">
            <span>New password</span>
            <span class="field-input">
              <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" name="password" id="forgot-password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required>
              <button type="button" class="field-toggle" data-toggle-for="forgot-password" aria-label="Show password">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </span>
          </label>
          <label class="field">
            <span>Confirm password</span>
            <span class="field-input">
              <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" name="confirm_password" id="forgot-confirm" autocomplete="new-password" placeholder="Re-enter password" minlength="8" required>
            </span>
          </label>
          <button class="primary login-submit" type="submit"><span>Reset password</span></button>
          <button type="button" class="link-btn login-forgot-link" data-goto="login">Back to sign in</button>
        </form>
      </section>
    </div>
  </main>

  <script>
    (function () {
      var panels = { login: '#panel-login', forgot: '#panel-forgot' };
      var body = document.body;

      function show(view, pushUrl) {
        var current = body.getAttribute('data-view');
        if (current === view && !pushUrl) return;
        Object.keys(panels).forEach(function (key) {
          var el = document.querySelector(panels[key]);
          if (!el) return;
          if (key === view) {
            el.hidden = false;
            el.classList.remove('panel-enter');
            void el.offsetWidth;
            el.classList.add('panel-enter');
          } else {
            el.hidden = true;
          }
        });
        body.setAttribute('data-view', view);
        if (pushUrl !== false) {
          window.history.pushState({ view: view }, '', '/?view=' + view);
        }
      }

      document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-goto]');
        if (trigger) { e.preventDefault(); show(trigger.getAttribute('data-goto'), true); return; }

        var toggle = e.target.closest('.field-toggle');
        if (toggle) {
          var input = document.getElementById(toggle.getAttribute('data-toggle-for'));
          if (input) input.type = input.type === 'password' ? 'text' : 'password';
        }
      });

      window.addEventListener('popstate', function (e) {
        var v = (e.state && e.state.view) || 'login';
        show(v, false);
      });

      document.querySelectorAll('.login-submit').forEach(function (btn) {
        var form = btn.closest('form');
        if (!form) return;
        form.addEventListener('submit', function () { btn.classList.add('is-loading'); btn.disabled = true; });
      });
    })();
  </script>
</body></html>
