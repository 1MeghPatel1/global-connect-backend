import { Auth, google } from 'googleapis';
import { oauth2_v2 } from 'googleapis';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LibService {
  private googleOAuth2Client: Auth.OAuth2Client;
  private oauth2: oauth2_v2.Oauth2;

  constructor(private configService: ConfigService) {
    const clientId = this.configService.get<string>(
      'GOOGLE_CLIENT_ID',
    ) as string;
    const clientSecret = this.configService.get<string>(
      'GOOGLE_CLIENT_SECRET',
    ) as string;
    const redirectUri = this.configService.get<string>(
      'GOOGLE_REDIRECT_URI',
    ) as string;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Google OAuth2 environment variables');
    }

    this.googleOAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    // Initialize the OAuth2 API
    this.oauth2 = google.oauth2('v2');
  }

  getGoogleOAuth2Client(): Auth.OAuth2Client {
    return this.googleOAuth2Client;
  }

  getOAuth2Api(): oauth2_v2.Oauth2 {
    return this.oauth2;
  }

  // Add more library initializations as needed
}
