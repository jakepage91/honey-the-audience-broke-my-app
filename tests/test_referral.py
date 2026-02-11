from unittest.mock import MagicMock, patch


class TestReferralValidation:
    def test_validate_referral_returns_partner(self):
        mock_partner = MagicMock()
        mock_partner.code = "test-code"
        mock_partner.name = "Test Partner"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_partner

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        with patch('app.referral.engine', mock_engine):
            from app.referral import validate_referral
            result = validate_referral("test-code")

        assert result == mock_partner
        mock_conn.close.assert_called_once()

    def test_validate_referral_returns_none_for_invalid_code(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        with patch('app.referral.engine', mock_engine):
            from app.referral import validate_referral
            result = validate_referral("invalid-code")

        assert result is None
        mock_conn.close.assert_called_once()

    def test_validate_referral_connection_closed_on_success(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        with patch('app.referral.engine', mock_engine):
            from app.referral import validate_referral
            validate_referral("any-code")

        mock_conn.close.assert_called_once()
