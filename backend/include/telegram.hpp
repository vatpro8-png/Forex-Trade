#pragma once

#include "types.hpp"
#include <memory>
#include <string>
#include <vector>

namespace sfc::telegram {

	/**
	 * Telegram bot integration for signal publishing
	 */
	class TelegramPublisher {
	public:
		explicit TelegramPublisher(const std::string& bot_token, const std::string& chat_id);

		/**
		 * Publish signal to Telegram
		 */
		struct PublishResult {
			bool success;
			int64_t message_id;
			std::string error;
		};

		PublishResult publish_signal(const sfc::types::Signal& signal);

		/**
		 * Edit an existing message (for status updates)
		 */
		bool update_message(int64_t message_id, const std::string& new_text);

		/**
		 * Mark signal as completed in Telegram
		 */
		bool mark_signal_complete(int64_t message_id, sfc::types::SignalStatus status);

		/**
		 * Retry failed delivery
		 */
		PublishResult retry_delivery(const sfc::types::TelegramDelivery& delivery);

	private:
		std::string bot_token_;
		std::string chat_id_;

		// Helper methods
		std::string format_signal_message(const sfc::types::Signal& signal) const;
		std::string direction_to_emoji(sfc::types::SignalDirection direction) const;
		std::string format_price(double price) const;
		bool send_api_request(const std::string& method, const std::string& json_payload);
	};

}  // namespace sfc::telegram
