#pragma once

#include "types.hpp"
#include <memory>
#include <string>
#include <optional>

namespace sfc::auth {

	/**
	 * Authentication and authorization service
	 */
	class AuthService {
	public:
		// Registration and login
		struct LoginResult {
			bool success;
			std::shared_ptr<sfc::types::User> user;
			std::string error;
			std::string session_token;  // JWT or session ID
		};

		struct RegisterResult {
			bool success;
			int64_t user_id;
			std::string error;
			std::string session_token;
		};

		RegisterResult register_user(const std::string& email, 
									const std::string& username, 
									const std::string& password);

		LoginResult login(const std::string& email, const std::string& password);

		bool logout(const std::string& session_token);

		// Session/Token validation
		std::optional<int64_t> validate_token(const std::string& token) const;

		bool is_user_premium(int64_t user_id) const;

		bool is_user_admin(int64_t user_id) const;

		// Password operations
		std::string hash_password(const std::string& password);

		bool verify_password(const std::string& password, const std::string& hash);

	private:
		static const uint32_t BCRYPT_COST = 12;
		static const int SESSION_TIMEOUT_MINUTES = 60;
	};

}  // namespace sfc::auth
