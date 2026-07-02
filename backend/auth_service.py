"""
Authentication Service
Handles password hashing, JWT tokens, and email verification
"""

import os
import secrets
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any

import bcrypt
from jose import JWTError, jwt
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ============================================================================
# Configuration
# ============================================================================

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
ACTIVATION_TOKEN_EXPIRE_HOURS = 72

# Email Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5176")

# ============================================================================
# Password Hashing
# ============================================================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password must be 72 bytes or fewer")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False
    return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


# ============================================================================
# JWT Token Management
# ============================================================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_activation_token(email: str) -> str:
    """Create an activation token for email verification."""
    data = {
        "email": email,
        "type": "activation"
    }
    return create_access_token(data, timedelta(hours=ACTIVATION_TOKEN_EXPIRE_HOURS))


def verify_token(token: str) -> Dict[str, Any]:
    """Verify a JWT token and return payload."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ============================================================================
# Email Service
# ============================================================================

def send_activation_email(email: str, full_name: str, activation_token: str) -> bool:
    """
    Send activation email with verification link.
    
    Args:
        email: User's email address
        full_name: User's full name
        activation_token: JWT token for activation
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print("⚠️  Email configuration not set. Skipping email send.")
        print(f"Activation link: {FRONTEND_URL}/activate?token={activation_token}")
        return True
    
    try:
        # Create activation link
        activation_link = f"{FRONTEND_URL}/activate?token={activation_token}"
        
        # Create email message
        message = MIMEMultipart("alternative")
        message["Subject"] = "🎬 Cinema Pulse - Xác nhận email đăng ký"
        message["From"] = SENDER_EMAIL
        message["To"] = email
        
        # HTML content
        html = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 10px;">
              <h2 style="color: #22c55e; text-align: center;">🎬 Cinema Pulse</h2>
              <p>Xin chào <strong>{full_name}</strong>,</p>
              <p>Cảm ơn bạn đã đăng ký tài khoản Cinema Pulse!</p>
              <p>Vui lòng nhấp vào nút bên dưới để xác nhận email của bạn:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{activation_link}" 
                   style="background-color: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Xác nhận Email
                </a>
              </div>
              <p>Hoặc sao chép đường dẫn này vào trình duyệt:</p>
              <p style="background-color: #f0f0f0; padding: 10px; border-radius: 5px; word-break: break-all;">
                {activation_link}
              </p>
              <p style="color: #999; font-size: 12px;">
                Liên kết này sẽ hết hạn trong 72 giờ.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Cinema Pulse. All rights reserved.
              </p>
            </div>
          </body>
        </html>
        """
        
        part = MIMEText(html, "html")
        message.attach(part)
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, email, message.as_string())
        
        print(f"✅ Activation email sent to {email}")
        return True
        
    except Exception as e:
        print(f"❌ Error sending email: {str(e)}")
        return False


def send_login_email(email: str, full_name: str, login_time: str) -> bool:
    """
    Send login notification email.
    
    Args:
        email: User's email address
        full_name: User's full name
        login_time: Time of login
    
    Returns:
        bool: True if email sent successfully
    """
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return True
    
    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = "🎬 Cinema Pulse - Thông báo đăng nhập"
        message["From"] = SENDER_EMAIL
        message["To"] = email
        
        html = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 10px;">
              <h2 style="color: #22c55e; text-align: center;">🎬 Cinema Pulse</h2>
              <p>Xin chào <strong>{full_name}</strong>,</p>
              <p>Bạn vừa đăng nhập vào tài khoản Cinema Pulse.</p>
              <p><strong>Thời gian:</strong> {login_time}</p>
              <p style="color: #999; font-size: 12px; margin-top: 20px;">
                Nếu không phải là bạn, vui lòng đổi mật khẩu ngay.
              </p>
            </div>
          </body>
        </html>
        """
        
        part = MIMEText(html, "html")
        message.attach(part)
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, email, message.as_string())
        
        return True
        
    except Exception as e:
        print(f"❌ Error sending login email: {str(e)}")
        return False
