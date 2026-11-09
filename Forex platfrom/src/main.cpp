#define _CRT_SECURE_NO_WARNINGS
#include "signal_service.h"

#include <iostream>
#include <string>

int main()
{
	const auto config = AppConfig::fromEnvironment();
	SignalService service(config);

	std::cout << "SF CAPITAL FX signal service listening on http://0.0.0.0:" << config.port << '\n';
	std::cout << "TradingView webhook: POST /api/webhooks/tradingview\n";
	std::cout << "Health check: GET /health\n";

	try
	{
		service.run();
	}
	catch (const std::exception& exception)
	{
		std::cerr << "Fatal error: " << exception.what() << '\n';
		return 1;
	}

	return 0;
}
