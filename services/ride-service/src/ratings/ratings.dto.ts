import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
export class CreateRatingDto {
  // Les identifiants sont stockés en TEXT (les comptes de démo utilisent des UUID
  // « lisibles » non conformes RFC 4122). On valide donc en tant que chaînes non
  // vides ; le service vérifie ensuite que rideId existe et que toUserId est bien
  // le passager ou le chauffeur de la course.
  @ApiProperty() @IsString() @IsNotEmpty() rideId: string;
  @ApiProperty() @IsString() @IsNotEmpty() toUserId: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) score: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
