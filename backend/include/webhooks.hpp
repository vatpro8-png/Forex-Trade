#pragma once

#include "types.hpp"
#include <memory>
#include <string>
#include <optional>
#include <functional>

namespace sfc::webhooks {

	/**
	 * Handler for TradingView webhook signals
	 */
	class TradingViewWebhookHandler {
	public:
		struct WebhookPayload {
			std::string trading_pair;
			std::string direction;  // "BUY" or "SELL"
			double entry_price;
			double stop_loss;
			double take_profit_1;
			double take_profit_2;
			double take_profit_3;
			std::string timestamp;  // ISO 8601 format
			std::string signature;  // HMAC-SHA256 if applicable
			std::string event_id;   // For idempotency
		};

		struct WebhookResponse {
			bool success;
			std::string message;
			int64_t signal_id;
			std::string error;
			int http_status;
		};

		explicit TradingViewWebhookHandler(const std::string& webhook_secret);

		/**
		 * Validate webhook signature and extract payload
		 */
		std::optional<WebhookPayload> validate_and_parse(const std::string& payload, 
														const std::string& signature);

		/**
		 * Process incoming TradingView signal
		 */
		WebhookResponse process_signal(const WebhookPayload& payload);

		/**
		 * Normalize trading pair format (e.g., XAUUSD, EURUSD)
		 */
		static std::string normalize_pair(const std::string& pair);

		/**
		 * Validate signal fields
		 */
		static bool validate_payload(const WebhookPayload& payload);

	private:
		std::string webhook_secret_;

		// Helper methods
		std::string compute_hmac(const std::string& payload) const;
		sfc::types::SignalDirection parse_direction(const std::string& direction);
		bool is_valid_pair(const std::string& pair) const;
	};

}  // namespace sfc::webhooks
