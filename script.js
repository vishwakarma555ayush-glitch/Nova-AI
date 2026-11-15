
import { auth } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    reload,
    updateProfile,
    RecaptchaVerifier,
    linkWithPhoneNumber,
    signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

// HTML ELEMENTS
const loginSection = document.getElementById("login-section");
const signupSection = document.getElementById("signup-section");
const emailSection = document.getElementById("email-verification");
const phoneSection = document.getElementById("phone-verification");
const message = document.getElementById("message");

// VARIABLES
let confirmationResult = null;
let recaptchaVerifier = null;

// SHOW MESSAGE
function showMessage(text) {
    message.innerText = text;
}

// SHOW SECTION
function showSection(section) {
    loginSection.hidden = true;
    signupSection.hidden = true;
    emailSection.hidden = true;
    phoneSection.hidden = true;

    section.hidden = false;
}

// OPEN HOMEPAGE
function openHome() {
    sessionStorage.setItem("novaShowIntro", "true");
    window.location.replace("/home.html");
}

// SIGNUP PAGE
document.getElementById("show-signup").addEventListener("click", () => {
    showSection(signupSection);
    showMessage("");
});

// LOGIN PAGE
document.getElementById("show-login").addEventListener("click", () => {
    showSection(loginSection);
    showMessage("");
});

// SIGN UP
document.getElementById("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    try {
        showMessage("Creating your account...");

        const result = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await updateProfile(result.user, {
            displayName: name
        });

        await sendEmailVerification(result.user);

        showSection(emailSection);
        showMessage("Verification email sent! Check your Gmail.");

    } catch (error) {
        showMessage("Signup Error: " + error.message);
    }
});

// EMAIL VERIFICATION
document.getElementById("check-email").addEventListener("click", async () => {
    try {
        if (!auth.currentUser) {
            showMessage("Please sign up again.");
            return;
        }

        await reload(auth.currentUser);

        if (auth.currentUser.emailVerified) {
            showSection(phoneSection);
            showMessage("Email verified! Now verify your phone.");
        } else {
            showMessage("Please verify your Gmail first.");
        }

    } catch (error) {
        showMessage(error.message);
    }
});

// RECAPTCHA
function setupRecaptcha() {
    if (!recaptchaVerifier) {
        recaptchaVerifier = new RecaptchaVerifier(
            auth,
            "recaptcha-container",
            { size: "normal" }
        );
    }
}

// SEND PHONE OTP
document.getElementById("send-otp").addEventListener("click", async () => {
    try {
        const user = auth.currentUser;

        if (!user || !user.emailVerified) {
            showMessage("Verify your email first.");
            return;
        }

        const phone = document.getElementById("signup-phone").value.trim();

        if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
            showMessage("Enter phone with country code, e.g. +91XXXXXXXXXX");
            return;
        }

        setupRecaptcha();

        showMessage("Sending verification request...");

        confirmationResult = await linkWithPhoneNumber(
            user,
            phone,
            recaptchaVerifier
        );

        showMessage("Verification request successful. Enter your code.");

    } catch (error) {
        showMessage("Phone Error: " + error.message);

        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }
    }
});

// VERIFY PHONE
document.getElementById("verify-otp").addEventListener("click", async () => {
    try {
        if (!confirmationResult) {
            showMessage("Request verification first.");
            return;
        }

        const otp = document.getElementById("otp-code").value.trim();

        if (!/^\d{6}$/.test(otp)) {
            showMessage("Enter the 6-digit verification code.");
            return;
        }

        await confirmationResult.confirm(otp);

        confirmationResult = null;

        showMessage("Your NOVA AI account is verified!");

        await signOut(auth);

        showSection(loginSection);
        showMessage("Account ready! Sign in with Gmail and password.");

    } catch (error) {
        showMessage("Verification failed: " + error.message);
    }
});

// SIGN IN
document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        showMessage("Signing in...");

        const result = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        await reload(result.user);

        const user = result.user;

        if (!user.emailVerified) {
            showSection(emailSection);
            showMessage("Please verify your Gmail first.");
            return;
        }

        if (!user.phoneNumber) {
            showSection(phoneSection);
            showMessage("Please complete phone verification during signup.");
            return;
        }

        showMessage("Login successful! Opening NOVA AI...");
        openHome();

    } catch (error) {
        showMessage("Login failed: " + error.message);
    }
});

console.log("NOVA AI Authentication System Ready!");
