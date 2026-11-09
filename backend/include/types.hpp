#pragma once

#include <string>
#include <nlohmann/json.hpp>
#include <cstdint>
#include <chrono>

using json = nlohmann::json;

namespace sfc::types {

	// Enums for signal types and statuses
	enum class SignalDirection {
		BUY = 0,
		SELL = 1
	};

	enum class SignalStatus {
		ACTIVE = 0,
		TP1_HIT = 1,
		TP2_HIT = 2,
		TP3_HIT = 3,
		SL_HIT = 4,
		CLOSED = 5,
		CANCELLED = 6
	};

	enum class MembershipTier {
		FREE = 0,
		PREMIUM = 1
	};

	enum class PaymentStatus {
		PENDING = 0,
		COMPLETED = 1,
		FAILED = 2,
		REFUNDED = 3
	};

	enum class TelegramDeliveryStatus {
		PENDING = 0,
		DELIVERED = 1,
		FAILED = 2,
		RETRYING = 3
	};

	// Signal structure
	struct Signal {
		int64_t id;
		std::string external_id;  // Idempotency key
		std::string trading_pair;
		SignalDirection direction;
		double entry_price;
		double stop_loss;
		double take_profit_1;
		double take_profit_2;
		double take_profit_3;
		std::chrono::system_clock::time_point created_at;
		std::chrono::system_clock::time_point event_time;  // TradingView alert time
		SignalStatus status;
		int64_t created_by_user_id;
		bool is_published;

		json to_json() const;
		static Signal from_json(const json& j);
	};

	// User structure
	struct User {
		int64_t id;
		std::string email;
		std::string password_hash;
		std::string username;
		MembershipTier membership_tier;
		bool email_verified;
		bool is_active;
		std::chrono::system_clock::time_point created_at;
		std::chrono::system_clock::time_point last_login;

		json to_json() const;
		static User from_json(const json& j);
	};

	// Subscription structure
	struct Subscription {
		int64_t id;
		int64_t user_id;
		MembershipTier tier;
		std::chrono::system_clock::time_point started_at;
		std::chrono::system_clock::time_point renews_at;
		std::chrono::system_clock::time_point cancelled_at;
		std::string external_subscription_id;  // Payment provider
		double amount_paid;
		std::string currency;
		bool is_active;

		json to_json() const;
		static Subscription from_json(const json& j);
	};

	// Signal Milestone structure (for TP/SL hits)
	struct SignalMilestone {
		int64_t id;
		int64_t signal_id;
		SignalStatus status;
		std::chrono::system_clock::time_point occurred_at;
		double milestone_price;
		std::string notes;

		json to_json() const;
		static SignalMilestone from_json(const json& j);
	};

	// Telegram Delivery record
	struct TelegramDelivery {
		int64_t id;
		int64_t signal_id;
		int64_t telegram_message_id;
		TelegramDeliveryStatus status;
		std::chrono::system_clock::time_point sent_at;
		int retry_count;
		std::string error_message;

		json to_json() const;
		static TelegramDelivery from_json(const json& j);
	};

}  // namespace sfc::types
