#include "telegram.hpp"
#include <nlohmann/json.hpp>
#include <sstream>
#include <iomanip>
#include <cmath>

using json = nlohmann::json;

namespace sfc::telegram {

	TelegramPublisher::TelegramPublisher(const std::string& bot_token, const std::string& chat_id)
		: bot_token_(bot_token), chat_id_(chat_id) {}

	TelegramPublisher::PublishResult TelegramPublisher::publish_signal(const sfc::types::Signal& signal) {
		PublishResult result;
		result.success = false;
		result.message_id = 0;

		try {
			std::string message = format_signal_message(signal);

			json request;
			request["chat_id"] = chat_id_;
			request["text"] = message;
			request["parse_mode"] = "HTML";

			std::string payload = request.dump();

			if (send_api_request("sendMessage", payload)) {
				result.success = true;
				result.message_id = 0;  // Would extract from response in production
				return result;
			}

			result.error = "Failed to send Telegram message";
			return result;
		} catch (const std::exception& e) {
			result.error = std::string("Telegram publisher error: ") + e.what();
			return result;
		}
	}

	bool TelegramPublisher::update_message(int64_t message_id, const std::string& new_text) {
		try {
			json request;
			request["chat_id"] = chat_id_;
			request["message_id"] = message_id;
			request["text"] = new_text;
			request["parse_mode"] = "HTML";

			return send_api_request("editMessageText", request.dump());
		} catch (const std::exception& e) {
			return false;
		}
	}

	bool TelegramPublisher::mark_signal_complete(int64_t message_id, 
												  sfc::types::SignalStatus status) {
		std::string status_emoji;
		std::string status_text;

		switch (status) {
			case sfc::types::SignalStatus::TP1_HIT:
				status_emoji = "✅";
				status_text = "TP1 HIT";
				break;
			case sfc::types::SignalStatus::TP2_HIT:
				status_emoji = "✅";
				status_text = "TP2 HIT";
				break;
			case sfc::types::SignalStatus::TP3_HIT:
				status_emoji = "✅✅✅";
				status_text = "TP3 HIT - FULL CLOSE";
				break;
			case sfc::types::SignalStatus::SL_HIT:
				status_emoji = "❌";
				status_text = "STOP LOSS HIT";
				break;
			default:
				return false;
		}

		std::string update = status_emoji + " " + status_text;
		return update_message(message_id, update);
	}

	TelegramPublisher::PublishResult TelegramPublisher::retry_delivery(
		const sfc::types::TelegramDelivery& delivery) {
		// Would fetch the signal from DB and republish
		PublishResult result;
		result.success = false;
		result.error = "Retry not implemented in MVP";
		return result;
	}

	std::string TelegramPublisher::format_signal_message(const sfc::types::Signal& signal) const {
		std::ostringstream oss;

		// Header with emoji
		oss << direction_to_emoji(signal.direction);
		oss << " <b>SF CAPITAL FX TRADING SIGNAL</b>\n";
		oss << "━━━━━━━━━━━━━━━━━\n\n";

		// Pair
		oss << "<b>📊 Trading Pair:</b> " << signal.trading_pair << "\n";

		// Direction
		std::string direction_text = (signal.direction == sfc::types::SignalDirection::BUY) 
			? "🔵 BUY" : "🔴 SELL";
		oss << "<b>Direction:</b> " << direction_text << "\n\n";

		// Prices
		oss << "<b>💰 Entry Price:</b> <code>" << format_price(signal.entry_price) << "</code>\n";
		oss << "<b>🛑 Stop Loss (SL):</b> <code>" << format_price(signal.stop_loss) << "</code>\n\n";

		// Take Profits
		oss << "<b>🎯 Take Profits:</b>\n";
		oss << "   TP1: <code>" << format_price(signal.take_profit_1) << "</code>\n";
		if (signal.take_profit_2 > 0) {
			oss << "   TP2: <code>" << format_price(signal.take_profit_2) << "</code>\n";
		}
		if (signal.take_profit_3 > 0) {
			oss << "   TP3: <code>" << format_price(signal.take_profit_3) << "</code>\n";
		}

		oss << "\n";

		// Timestamps
		auto event_time = std::chrono::system_clock::to_time_t(signal.event_time);
		std::ostringstream time_oss;
		time_oss << std::put_time(std::gmtime(&event_time), "%Y-%m-%d %H:%M:%S UTC");
		oss << "<b>🕐 Signal Time:</b> " << time_oss.str() << "\n";

		oss << "\n━━━━━━━━━━━━━━━━━\n";
		oss << "⚠️ <i>Always use proper risk management. This is not financial advice.</i>\n";
		oss << "📱 <b>Subscribe to Premium for more signals</b>";

		return oss.str();
	}

	std::string TelegramPublisher::direction_to_emoji(sfc::types::SignalDirection direction) const {
		return (direction == sfc::types::SignalDirection::BUY) ? "📈 " : "📉 ";
	}

	std::string TelegramPublisher::format_price(double price) const {
		std::ostringstream oss;
		oss << std::fixed << std::setprecision(5) << price;
		return oss.str();
	}

	bool TelegramPublisher::send_api_request(const std::string& method, 
										  const std::string& json_payload) {
		// In production, use libcurl to send HTTPS POST to Telegram API
		// https://api.telegram.org/bot{token}/sendMessage
		// For MVP, just log and return true

		std::cerr << "Telegram API call: " << method << std::endl;
		std::cerr << "Payload: " << json_payload << std::endl;

		return true;  // Mock success for MVP
	}

}  // namespace sfc::telegram
