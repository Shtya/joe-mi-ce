import { Controller, Get, HostParam } from '@nestjs/common';

@Controller({}) // Handle requests for api.example.com
export class ApiController {
  @Get()
  getApi() {
    return 'Welcome to the API subdomain!';
  }
}
