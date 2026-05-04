"""Tests for backend.lib.crypto — field-level AES-256-GCM encryption."""

from __future__ import annotations

import os
import unittest

# Generate a stable 32-byte test key (64 hex chars).
_TEST_KEY = "ab" * 32   # 64 hex chars = 32 bytes
_ALT_KEY   = "cd" * 32   # different 32-byte key for rotation tests


class CryptoModuleTest(unittest.TestCase):
    def setUp(self):
        # Reset module state before each test so keys don't bleed between cases.
        from backend.lib.crypto import reset_for_testing
        reset_for_testing(key_hex=_TEST_KEY)

    def tearDown(self):
        from backend.lib.crypto import reset_for_testing
        reset_for_testing(key_hex=_TEST_KEY)

    # ------------------------------------------------------------------
    # Basic round-trip
    # ------------------------------------------------------------------

    def test_encrypt_returns_enc1_prefix(self):
        from backend.lib.crypto import encrypt
        ct = encrypt("hello")
        self.assertTrue(ct.startswith("enc1:"), f"Expected enc1: prefix, got: {ct[:20]}")

    def test_encrypt_decrypt_roundtrip(self):
        from backend.lib.crypto import encrypt, decrypt
        plaintext = "totp-secret-base32-JBSWY3DPEHPK3PXP"
        ct = encrypt(plaintext)
        self.assertNotEqual(ct, plaintext)
        result = decrypt(ct)
        self.assertEqual(result, plaintext)

    def test_encrypt_produces_different_ciphertext_each_call(self):
        """AES-GCM with random nonce: same plaintext → different ciphertext."""
        from backend.lib.crypto import encrypt
        ct1 = encrypt("same-value")
        ct2 = encrypt("same-value")
        self.assertNotEqual(ct1, ct2)

    def test_decrypt_legacy_plaintext_passthrough(self):
        """Rows without enc1: prefix are returned unchanged (rolling upgrade)."""
        from backend.lib.crypto import decrypt
        result = decrypt("plaintext-secret")
        self.assertEqual(result, "plaintext-secret")

    def test_encrypted_value_is_not_plaintext(self):
        """Ciphertext must not contain the original secret."""
        from backend.lib.crypto import encrypt
        secret = "super-secret-totp-seed"
        ct = encrypt(secret)
        self.assertNotIn(secret, ct)

    # ------------------------------------------------------------------
    # EncryptedString TypeDecorator
    # ------------------------------------------------------------------

    def test_type_decorator_bind_encrypts(self):
        from backend.lib.crypto import EncryptedString, _ENC_PREFIX
        td = EncryptedString()
        result = td.process_bind_param("my-secret", dialect=None)
        self.assertIsNotNone(result)
        self.assertTrue(result.startswith(_ENC_PREFIX))

    def test_type_decorator_bind_none_is_none(self):
        from backend.lib.crypto import EncryptedString
        td = EncryptedString()
        self.assertIsNone(td.process_bind_param(None, dialect=None))

    def test_type_decorator_result_decrypts(self):
        from backend.lib.crypto import EncryptedString, encrypt
        td = EncryptedString()
        ct = encrypt("my-value")
        result = td.process_result_value(ct, dialect=None)
        self.assertEqual(result, "my-value")

    def test_type_decorator_result_none_is_none(self):
        from backend.lib.crypto import EncryptedString
        td = EncryptedString()
        self.assertIsNone(td.process_result_value(None, dialect=None))

    def test_type_decorator_result_legacy_passthrough(self):
        """Plain values (no enc1: prefix) from legacy rows are returned as-is."""
        from backend.lib.crypto import EncryptedString
        td = EncryptedString()
        result = td.process_result_value("legacy-plain", dialect=None)
        self.assertEqual(result, "legacy-plain")

    def test_type_decorator_bind_already_encrypted_not_double_encrypted(self):
        """If a value already starts with enc1: it should NOT be encrypted again."""
        from backend.lib.crypto import EncryptedString, encrypt, decrypt
        td = EncryptedString()
        original = "my-value"
        ct = encrypt(original)
        # Calling bind_param on already-encrypted value should return the same ciphertext.
        result = td.process_bind_param(ct, dialect=None)
        self.assertEqual(result, ct)
        # And it should still decrypt cleanly.
        self.assertEqual(decrypt(result), original)

    # ------------------------------------------------------------------
    # Key rotation
    # ------------------------------------------------------------------

    def test_key_rotation_decrypt_with_previous_key(self):
        """Values encrypted with the old key must decrypt after key rotation."""
        from backend.lib import crypto

        # Encrypt with the original key.
        crypto.reset_for_testing(key_hex=_TEST_KEY)
        ct = crypto.encrypt("rotate-me")

        # Rotate: set new current key, mark old key as previous.
        crypto.reset_for_testing(key_hex=_ALT_KEY)
        crypto._previous_key = crypto._hex_to_aesgcm(_TEST_KEY)
        crypto._initialized = True

        # Decrypt should succeed via previous key.
        result = crypto.decrypt(ct)
        self.assertEqual(result, "rotate-me")

    def test_wrong_key_raises(self):
        """Decryption with a completely wrong key must raise ValueError."""
        from backend.lib import crypto
        crypto.reset_for_testing(key_hex=_TEST_KEY)
        ct = crypto.encrypt("secret")

        # Switch to a different key with no previous key.
        crypto.reset_for_testing(key_hex=_ALT_KEY)

        with self.assertRaises(ValueError):
            crypto.decrypt(ct)

    # ------------------------------------------------------------------
    # Error handling
    # ------------------------------------------------------------------

    def test_invalid_key_length_raises(self):
        from backend.lib.crypto import _hex_to_aesgcm
        with self.assertRaises(ValueError):
            _hex_to_aesgcm("tooshort")

    def test_tampered_ciphertext_raises(self):
        from backend.lib.crypto import encrypt, decrypt
        ct = encrypt("value")
        # Corrupt the last byte of the base64 blob.
        corrupted = ct[:-3] + "AAA"
        with self.assertRaises(Exception):
            decrypt(corrupted)

    def test_missing_key_in_non_dev_mode_raises(self):
        """App should refuse to start without ENCRYPTION_KEY in non-dev mode."""
        import os
        from backend.lib import crypto
        crypto.reset_for_testing()

        orig_key = os.environ.pop("ENCRYPTION_KEY", None)
        orig_dev = os.environ.pop("PERSONAL_STATERA_DEV_MODE", None)
        orig_dev_legacy = os.environ.pop("DINARTRACK_DEV_MODE", None)
        try:
            os.environ["PERSONAL_STATERA_DEV_MODE"] = "false"
            with self.assertRaises(RuntimeError):
                crypto._load_keys()
        finally:
            if orig_key is not None:
                os.environ["ENCRYPTION_KEY"] = orig_key
            if orig_dev is not None:
                os.environ["PERSONAL_STATERA_DEV_MODE"] = orig_dev
            else:
                os.environ.pop("PERSONAL_STATERA_DEV_MODE", None)
            if orig_dev_legacy is not None:
                os.environ["DINARTRACK_DEV_MODE"] = orig_dev_legacy
            crypto.reset_for_testing(key_hex=_TEST_KEY)


if __name__ == "__main__":
    unittest.main()
