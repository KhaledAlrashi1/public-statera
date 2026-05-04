import threading

from preflight_base import PreflightApiTestBase


class ConcurrentDedupTests(PreflightApiTestBase):
    def test_concurrent_create_same_transaction(self):
        self._create_user("dedup-concurrent@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "dedup-concurrent@example.com", "Password123!")
        seed = self._post(
            setup_client,
            "/api/categories",
            json={"name": "Food", "is_income": False},
        )
        self.assertIn(seed.status_code, (200, 201), seed.get_data(as_text=True))

        results: list[int] = []
        barrier = threading.Barrier(2)

        def create() -> None:
            client = self.app.test_client()
            self._login(client, "dedup-concurrent@example.com", "Password123!")
            barrier.wait(timeout=5)
            response = self._post(
                client,
                "/api/transactions/create",
                json={
                    "date": "2026-03-10",
                    "name": "Concurrent Test",
                    "amount_kd": "50.000",
                    "category": "Food",
                },
            )
            results.append(response.status_code)

        first = threading.Thread(target=create)
        second = threading.Thread(target=create)
        first.start()
        second.start()
        first.join()
        second.join()

        self.assertEqual(sorted(results), [201, 409], f"Got: {results}")

        with self.app.app_context():
            matches = self.Transaction.query.filter_by(name="Concurrent Test").all()
            self.assertEqual(len(matches), 1)
