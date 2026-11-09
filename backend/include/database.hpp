#pragma once

#include "types.hpp"
#include <memory>
#include <string>
#include <vector>

namespace sfc::db {

	// Forward declaration
	class DatabaseConnection;

	/**
	 * Database abstraction layer for SF CAPITAL FX
	 * Handles all persistence operations
	 */
	class Database {
	public:
		explicit Database(const std::string& connection_string);
		~Database();

		// Connection management
		bool connect();
		void disconnect();
		bool is_connected() const;

		// User operations
		int64_t create_user(const sfc::types::User& user);
		std::shared_ptr<sfc::types::User> get_user_by_id(int64_t user_id);
		std::shared_ptr<sfc::types::User> get_user_by_email(const std::string& email);
		bool update_user(const sfc::types::User& user);
		bool user_exists(const std::string& email);

		// Signal operations
		int64_t create_signal(const sfc::types::Signal& signal);
		std::shared_ptr<sfc::types::Signal> get_signal_by_id(int64_t signal_id);
		std::shared_ptr<sfc::types::Signal> get_signal_by_external_id(const std::string& external_id);
		std::vector<std::shared_ptr<sfc::types::Signal>> get_signals_by_pair(const std::string& pair, int limit = 100);
		std::vector<std::shared_ptr<sfc::types::Signal>> get_active_signals();
		bool update_signal_status(int64_t signal_id, sfc::types::SignalStatus status);

		// Signal Milestone operations
		int64_t create_milestone(const sfc::types::SignalMilestone& milestone);
		std::vector<std::shared_ptr<sfc::types::SignalMilestone>> get_milestones_for_signal(int64_t signal_id);
		bool milestone_already_exists(int64_t signal_id, sfc::types::SignalStatus status);

		// Subscription operations
		int64_t create_subscription(const sfc::types::Subscription& subscription);
		std::shared_ptr<sfc::types::Subscription> get_subscription_by_user_id(int64_t user_id);
		bool update_subscription(const sfc::types::Subscription& subscription);
		std::vector<std::shared_ptr<sfc::types::Subscription>> get_expiring_subscriptions(int days = 7);

		// Telegram Delivery operations
		int64_t create_telegram_delivery(const sfc::types::TelegramDelivery& delivery);
		bool update_telegram_delivery_status(int64_t delivery_id, 
											sfc::types::TelegramDeliveryStatus status, 
											const std::string& error_msg = "");
		std::vector<std::shared_ptr<sfc::types::TelegramDelivery>> get_failed_deliveries();

		// Audit logging
		void log_audit(int64_t user_id, const std::string& action, const std::string& entity_type, 
					  int64_t entity_id, const std::string& details);

	private:
		std::string connection_string_;
		std::unique_ptr<DatabaseConnection> connection_;

		// Helper methods
		bool execute_query(const std::string& query);
		json execute_query_json(const std::string& query);
	};

}  // namespace sfc::db
