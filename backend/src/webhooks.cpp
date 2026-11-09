#include "webhooks.hpp"
#include <algorithm>
#include <cctype>
#include <openssl/sha.h>
#include <openssl/hmac.h>
#include <regex>
#include <sstream>
#include <iomanip>

namespace sfc::webhooks {

	TradingViewWebhookHandler::TradingViewWebhookHandler(const std::string& webhook_secret)
		: webhook_secret_(webhook_secret) {}

	std::optional<TradingViewWebhookHandler::WebhookPayload> 
	TradingViewWebhookHandler::validate_and_parse(const std::string& payload, 
												  const std::string& signature) {
		// Verify HMAC-SHA256 signature
		if (!signature.empty()) {
			std::string computed_sig = compute_hmac(payload);
			if (computed_sig != signature) {
				return std::nullopt;  // Signature verification failed
			}
		}

		try {
			json j = json::parse(payload);

			WebhookPayload parsed;
			parsed.trading_pair = j["trading_pair"];
			parsed.direction = j["direction"];
			parsed.entry_price = j["entry_price"];
			parsed.stop_loss = j["stop_loss"];
			parsed.take_profit_1 = j["take_profit_1"];
			parsed.take_profit_2 = j.value("take_profit_2", 0.0);
			parsed.take_profit_3 = j.value("take_profit_3", 0.0);
			parsed.timestamp = j["timestamp"];
			parsed.event_id = j.value("event_id", "");

			// Validate
			if (!validate_payload(parsed)) {
				return std::nullopt;
			}

			return parsed;
		} catch (const std::exception&) {
			return std::nullopt;  // JSON parse error
		}
	}

	TradingViewWebhookHandler::WebhookResponse 
	TradingViewWebhookHandler::process_signal(const WebhookPayload& payload) {
		WebhookResponse response;
		response.success = false;
		response.http_status = 400;

		// Normalize pair
		std::string normalized_pair = normalize_pair(payload.trading_pair);
		if (normalized_pair.empty()) {
			response.error = "Invalid trading pair";
			return response;
		}

		// Parse direction
		auto direction = parse_direction(payload.direction);

		// In production, insert into database through service layer
		try {
			sfc::types::Signal signal;
			signal.external_id = payload.event_id.empty() ? 
				"tv_" + std::to_string(std::time(nullptr)) : payload.event_id;
			signal.trading_pair = normalized_pair;
			signal.direction = direction;
			signal.entry_price = payload.entry_price;
			signal.stop_loss = payload.stop_loss;
			signal.take_profit_1 = payload.take_profit_1;
			signal.take_profit_2 = payload.take_profit_2;
			signal.take_profit_3 = payload.take_profit_3;
			signal.status = sfc::types::SignalStatus::ACTIVE;
			signal.is_published = false;
			signal.created_by_user_id = 0;  // System-generated

			// Would call DB service here in production
			response.success = true;
			response.http_status = 200;
			response.message = "Signal received and queued for publishing";
			response.signal_id = 1;  // Would be returned from DB insert

			return response;
		} catch (const std::exception& e) {
			response.error = std::string("Signal processing error: ") + e.what();
			response.http_status = 500;
			return response;
		}
	}

	std::string TradingViewWebhookHandler::normalize_pair(const std::string& pair) {
		// Convert to uppercase and validate format
		std::string normalized = pair;
		std::transform(normalized.begin(), normalized.end(), normalized.begin(), ::toupper);

		// Basic validation: alphanumeric, 6-7 chars (EURUSD, XAUUSD, etc.)
		std::regex pair_regex("^[A-Z]{6,7}$");
		if (!std::regex_match(normalized, pair_regex)) {
			return "";
		}

		return normalized;
	}

	bool TradingViewWebhookHandler::validate_payload(const WebhookPayload& payload) {
		// Validate all required fields are present and sensible
		if (payload.trading_pair.empty() || payload.direction.empty()) {
			return false;
		}

		if (payload.entry_price <= 0 || payload.stop_loss <= 0) {
			return false;
		}

		if (payload.take_profit_1 <= 0) {
			return false;
		}

		// Direction must be BUY or SELL
		std::string dir_upper = payload.direction;
		std::transform(dir_upper.begin(), dir_upper.end(), dir_upper.begin(), ::toupper);
		if (dir_upper != "BUY" && dir_upper != "SELL") {
			return false;
		}

		// For SELL, SL should be above entry; for BUY, SL should be below entry
		if (dir_upper == "BUY") {
			if (payload.stop_loss >= payload.entry_price) {
				return false;
			}
			if (payload.take_profit_1 <= payload.entry_price) {
				return false;
			}
		} else {
			if (payload.stop_loss <= payload.entry_price) {
				return false;
			}
			if (payload.take_profit_1 >= payload.entry_price) {
				return false;
			}
		}

		return true;
	}

	std::string TradingViewWebhookHandler::compute_hmac(const std::string& payload) const {
		unsigned char digest[EVP_MAX_MD_SIZE];
		unsigned int digest_len;

		HMAC(EVP_sha256(),
			 reinterpret_cast<const unsigned char*>(webhook_secret_.c_str()),
			 webhook_secret_.size(),
			 reinterpret_cast<const unsigned char*>(payload.c_str()),
			 payload.size(),
			 digest,
			 &digest_len);

		// Convert to hex string
		std::ostringstream oss;
		for (unsigned int i = 0; i < digest_len; ++i) {
			oss << std::hex << std::setfill('0') << std::setw(2) << (int)digest[i];
		}

		return oss.str();
	}

	sfc::types::SignalDirection TradingViewWebhookHandler::parse_direction(const std::string& direction) {
		std::string dir_upper = direction;
		std::transform(dir_upper.begin(), dir_upper.end(), dir_upper.begin(), ::toupper);

		return (dir_upper == "BUY") ? 
			sfc::types::SignalDirection::BUY : 
			sfc::types::SignalDirection::SELL;
	}

	bool TradingViewWebhookHandler::is_valid_pair(const std::string& pair) const {
		// Whitelist of supported pairs
		static const std::string supported_pairs[] = {
			"XAUUSD", "EURUSD", "USDJPY", "GBPUSD", "AUDUSD",
			"NZDUSD", "USDCAD", "USDCHF", "USDRUB"
		};

		std::string upper_pair = pair;
		std::transform(upper_pair.begin(), upper_pair.end(), upper_pair.begin(), ::toupper);

		return std::any_of(std::begin(supported_pairs), 
						  std::end(supported_pairs),
						  [&upper_pair](const std::string& p) { return p == upper_pair; });
	}

}  // namespace sfc::webhooks
