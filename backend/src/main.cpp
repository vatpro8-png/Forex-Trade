#include <iostream>
#include <memory>
#include <nlohmann/json.hpp>
#include "database.hpp"
#include "auth.hpp"
#include "webhooks.hpp"
#include "telegram.hpp"

using json = nlohmann::json;

/**
 * SF CAPITAL FX Backend API Server
 * 
 * This is a simplified HTTP server implementation for the MVP.
 * In production, use a robust HTTP framework like Pistache, Beast, or cpp-httplib
 */

class SFCAPIServer {
public:
	SFCAPIServer(const std::string& db_connection_string,
				const std::string& telegram_token,
				const std::string& telegram_chat_id,
				const std::string& webhook_secret)
		: db_(db_connection_string),
		  telegram_publisher_(telegram_token, telegram_chat_id),
		  webhook_handler_(webhook_secret),
		  auth_service_() {}

	bool initialize() {
		std::cout << "Initializing SF CAPITAL FX Backend..." << std::endl;

		// Connect to database
		if (!db_.connect()) {
			std::cerr << "Failed to connect to database" << std::endl;
			return false;
		}

		std::cout << "Database connected successfully" << std::endl;

		// In production, setup HTTP routes here:
		// - POST /api/v1/auth/register
		// - POST /api/v1/auth/login
		// - GET /api/v1/auth/me
		// - POST /api/v1/auth/logout
		// - POST /api/v1/webhooks/tradingview
		// - GET /api/v1/signals
		// - GET /api/v1/signals/{id}
		// - GET /api/v1/dashboard/summary
		// - etc.

		return true;
	}

	void run() {
		std::cout << "SF CAPITAL FX Backend API Server running on port 8443" << std::endl;
		std::cout << "Documentation at: docs/API.md" << std::endl;

		// Placeholder for HTTP server loop
		// In production, use HTTP framework event loop
		// For MVP testing, just keep running until signal

		// Simulate processing
		while (running_) {
			std::this_thread::sleep_for(std::chrono::seconds(1));
		}
	}

	void shutdown() {
		running_ = false;
		db_.disconnect();
		std::cout << "Server shutdown complete" << std::endl;
	}

	// API Handlers (simplified for MVP)

	json handle_register(const json& request) {
		try {
			std::string email = request["email"];
			std::string username = request["username"];
			std::string password = request["password"];

			auto result = auth_service_.register_user(email, username, password);

			if (!result.success) {
				return json{
					{"error", result.error},
					{"success", false}
				};
			}

			return json{
				{"success", true},
				{"user_id", result.user_id},
				{"session_token", result.session_token}
			};
		} catch (const std::exception& e) {
			return json{
				{"error", e.what()},
				{"success", false}
			};
		}
	}

	json handle_login(const json& request) {
		try {
			std::string email = request["email"];
			std::string password = request["password"];

			auto result = auth_service_.login(email, password);

			if (!result.success) {
				return json{
					{"error", result.error},
					{"success", false}
				};
			}

			return json{
				{"success", true},
				{"user", result.user->to_json()},
				{"session_token", result.session_token}
			};
		} catch (const std::exception& e) {
			return json{
				{"error", e.what()},
				{"success", false}
			};
		}
	}

	json handle_tradingview_webhook(const json& payload, const std::string& signature) {
		try {
			sfc::webhooks::TradingViewWebhookHandler::WebhookPayload wh_payload;
			wh_payload.trading_pair = payload["trading_pair"];
			wh_payload.direction = payload["direction"];
			wh_payload.entry_price = payload["entry_price"];
			wh_payload.stop_loss = payload["stop_loss"];
			wh_payload.take_profit_1 = payload["take_profit_1"];
			wh_payload.take_profit_2 = payload.value("take_profit_2", 0.0);
			wh_payload.take_profit_3 = payload.value("take_profit_3", 0.0);
			wh_payload.timestamp = payload["timestamp"];
			wh_payload.event_id = payload.value("event_id", "");

			// Validate and process
			auto response = webhook_handler_.process_signal(wh_payload);

			if (response.success) {
				// Publish to Telegram
				sfc::types::Signal signal;
				signal.id = response.signal_id;
				signal.trading_pair = wh_payload.trading_pair;
				signal.entry_price = wh_payload.entry_price;
				signal.stop_loss = wh_payload.stop_loss;
				signal.take_profit_1 = wh_payload.take_profit_1;
				signal.take_profit_2 = wh_payload.take_profit_2;
				signal.take_profit_3 = wh_payload.take_profit_3;

				auto telegram_result = telegram_publisher_.publish_signal(signal);

				return json{
					{"success", true},
					{"signal_id", response.signal_id},
					{"telegram_sent", telegram_result.success},
					{"message", response.message}
				};
			}

			return json{
				{"success", false},
				{"error", response.error}
			};
		} catch (const std::exception& e) {
			return json{
				{"success", false},
				{"error", e.what()}
			};
		}
	}

	json handle_get_signals(const std::string& pair = "", const std::string& status = "") {
		try {
			if (!pair.empty()) {
				auto signals = db_.get_signals_by_pair(pair);
				json result = json::array();
				for (const auto& sig : signals) {
					result.push_back(sig->to_json());
				}
				return result;
			}

			auto signals = db_.get_active_signals();
			json result = json::array();
			for (const auto& sig : signals) {
				result.push_back(sig->to_json());
			}
			return result;
		} catch (const std::exception& e) {
			return json{
				{"error", e.what()},
				{"success", false}
			};
		}
	}

private:
	sfc::db::Database db_;
	sfc::telegram::TelegramPublisher telegram_publisher_;
	sfc::webhooks::TradingViewWebhookHandler webhook_handler_;
	sfc::auth::AuthService auth_service_;
	bool running_ = true;
};

int main(int argc, char* argv[]) {
	// Load environment variables (in production, use proper config management)
	std::string db_conn = "postgresql://sfc_user:password@localhost:5432/sfc_capital_fx";
	std::string telegram_token = std::getenv("TELEGRAM_BOT_TOKEN") ? 
		std::getenv("TELEGRAM_BOT_TOKEN") : "test_token";
	std::string telegram_chat_id = std::getenv("TELEGRAM_CHAT_ID") ? 
		std::getenv("TELEGRAM_CHAT_ID") : "-1001234567890";
	std::string webhook_secret = std::getenv("TRADINGVIEW_WEBHOOK_SECRET") ? 
		std::getenv("TRADINGVIEW_WEBHOOK_SECRET") : "test_secret";

	try {
		// Create and initialize server
		SFCAPIServer server(db_conn, telegram_token, telegram_chat_id, webhook_secret);

		if (!server.initialize()) {
			std::cerr << "Failed to initialize server" << std::endl;
			return 1;
		}

		// Run server
		server.run();

		return 0;
	} catch (const std::exception& e) {
		std::cerr << "Fatal error: " << e.what() << std::endl;
		return 1;
	}
}
