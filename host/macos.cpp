#include <cstdio>
#include <cstdlib>
#include <chrono>
#include <thread>

#include <pqrs/karabiner/driverkit/virtual_hid_device_service.hpp>

namespace service = pqrs::karabiner::driverkit::virtual_hid_device_service;
namespace driver  = pqrs::karabiner::driverkit::virtual_hid_device_driver;
namespace hid     = pqrs::hid;

int main() {
    auto client = std::make_shared<service::client>();

    bool done = false;

    client->connected.connect([&client] {
        printf("Connected to daemon.\n");

        service::virtual_hid_keyboard_parameters params;
        params.set_country_code(hid::country_code::us);
        client->async_virtual_hid_keyboard_initialize(params);

        service::virtual_hid_pointing_parameters pointing_params;
        client->async_virtual_hid_pointing_initialize(pointing_params);
    });

    client->connect_failed.connect([](auto&& error) {
        printf("Connection failed: %s\n", error.message());
        exit(1);
    });

    client->virtual_hid_keyboard_ready_response.connect(
        [&client, &done](auto&& ready) {
            if (!ready) return;
            printf("Keyboard ready — sending 'a' keypress.\n");

            // Press 'a'
            driver::hid_report::keyboard_input press;
            press.keys.insert(hid::usage::keyboard_or_keypad::keyboard_a);
            client->async_post_report(press);

            std::this_thread::sleep_for(std::chrono::milliseconds(50));

            // Release
            driver::hid_report::keyboard_input release;
            client->async_post_report(release);

            printf("Keyboard done.\n");
            done = true;
        });

    client->virtual_hid_pointing_ready_response.connect(
        [&client](auto&& ready) {
            if (!ready) return;
            printf("Pointing ready — sending mouse move.\n");

            driver::hid_report::pointing_input move;
            move.x = 10;
            move.y = 10;
            client->async_post_report(move);

            printf("Pointing done.\n");
        });

    client->async_start();

    for (int i = 0; i < 50 && !done; i++)
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

    if (!done) {
        printf("Timed out.\n");
        return 1;
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    printf("Success.\n");
    return 0;
}